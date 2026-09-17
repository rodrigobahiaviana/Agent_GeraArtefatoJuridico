"""
server.py — Claude Agent SDK

Uma única chamada a query() aciona o coordenador (agente principal), que
delega para as subagentes definidas em .claude/agents/ e usa a skill em
.claude/skills/gerador-documentos-juridicos/, seguindo o fluxo descrito
no SKILL.md. Nenhuma orquestração manual é necessária — a sequência
levantamento → redação → revisão → (loop de correção) → montagem é
decidida pelo próprio agente, guiado pelas instruções da skill.

Além disso, cada geração (sucesso ou falha) é registrada em um log
estruturado (log/registro.jsonl), consultável por CPF/CNPJ ou por
inteiro via /api/log, e exportável como Markdown.

IMPORTANTE sobre "jurisprudência": este backend NUNCA inventa números de
processo, ementas ou citações de jurisprudência específicas — isso seria
um risco real de alucinação jurídica. Em vez disso, extrai os pontos
jurídicos já sinalizados no documento (marcadores [REVISAR: ...], que
vêm de referências verificadas na skill) e gera links de BUSCA no
Jusbrasil para cada um — um ponto de partida de pesquisa real, nunca uma
citação fabricada.

Requer Python 3.10+.
"""
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from claude_agent_sdk import query, ClaudeAgentOptions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("gerador-documentos-juridicos")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrinja isso em produção
    allow_methods=["*"],
    allow_headers=["*"],
)

# Diretório do projeto que contém .claude/agents/ e .claude/skills/
PROJECT_DIR = Path(__file__).parent.resolve()

# Onde o log de gerações é persistido — um objeto JSON por linha
LOG_DIR = PROJECT_DIR / "log"
LOG_PATH = LOG_DIR / "registro.jsonl"
LOG_DIR.mkdir(exist_ok=True)

# Campos comuns que podem conter CPF/CNPJ nos vários tipos de levantamento
CAMPOS_IDENTIFICADOR = [
    "cpf", "cnpj",
    "parte_a_documento", "parte_b_documento",
    "locador_documento", "locatario_documento", "fiador_documento",
    "empregado_cpf", "empregador_cnpj",
    "contratante_cnpj", "contratada_cnpj",
]


class GerarDocumentoRequest(BaseModel):
    tipoDocumento: str
    levantamento: dict


def extrair_identificador(levantamento: dict) -> str:
    """Procura um CPF/CNPJ nos campos comuns do levantamento, para
    permitir consulta posterior no log."""
    for campo in CAMPOS_IDENTIFICADOR:
        valor = levantamento.get(campo)
        if valor:
            return str(valor).strip()
    return "não informado"


def link_busca_jusbrasil(tema: str) -> str:
    """Gera um link de BUSCA no Jusbrasil para o tema jurídico
    sinalizado. Nunca uma citação específica — apenas um ponto de
    partida de pesquisa, para evitar fabricar jurisprudência."""
    return f"https://www.jusbrasil.com.br/busca?q={quote(tema[:120])}"


def extrair_temas_juridicos(texto_documento: str) -> list[dict]:
    """Extrai os marcadores [REVISAR: ...] do documento gerado — esses
    marcadores já vêm das referências verificadas na skill (leis e
    artigos reais) — e monta um link de busca no Jusbrasil para cada
    tema único."""
    temas_brutos = re.findall(r"\[REVISAR:\s*([^\]]+)\]", texto_documento)
    temas_unicos = list(dict.fromkeys(t.strip() for t in temas_brutos if t.strip()))
    return [{"tema": tema, "link_busca_jusbrasil": link_busca_jusbrasil(tema)} for tema in temas_unicos]


def registrar_log(entrada: dict) -> None:
    entrada["timestamp"] = datetime.now(timezone.utc).isoformat()
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")


def ler_entradas_log(identificador=None) -> list[dict]:
    if not LOG_PATH.exists():
        return []

    entradas = []
    with LOG_PATH.open("r", encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            try:
                entradas.append(json.loads(linha))
            except json.JSONDecodeError:
                logger.warning("Linha inválida no log, ignorada: %s", linha[:80])

    if identificador:
        alvo = identificador.strip().lower()
        entradas = [e for e in entradas if alvo in e.get("identificador", "").lower()]

    return entradas


def renderizar_log_markdown(entradas: list[dict], identificador) -> str:
    titulo = f"# Log de Gerações — {identificador}" if identificador else "# Log de Gerações — Todos os registros"
    linhas = [titulo, ""]

    if not entradas:
        linhas.append("Nenhum registro encontrado.")
        return "\n".join(linhas)

    for e in sorted(entradas, key=lambda x: x.get("timestamp", ""), reverse=True):
        status_label = "✅ SUCESSO" if e.get("status") == "sucesso" else "❌ FALHA"
        linhas.append(f"## {e.get('timestamp', '')} — {e.get('tipo_documento', '')} ({status_label})")
        linhas.append(f"- Identificador: {e.get('identificador', 'não informado')}")

        temas = e.get("temas_juridicos", [])
        if temas:
            linhas.append("- Temas jurídicos sinalizados (links de busca, não citações verificadas):")
            for t in temas:
                linhas.append(f"  - {t['tema']} — [buscar no Jusbrasil]({t['link_busca_jusbrasil']})")

        if e.get("status") != "sucesso":
            linhas.append(f"- Motivo da falha: {e.get('motivo_falha', 'não especificado')}")

        linhas.append("")

    return "\n".join(linhas)


@app.get("/api/saude")
def saude():
    """Health check simples — confirma que o servidor está de pé e que
    a variável de ambiente da chave de API foi carregada."""
    return {
        "status": "ok",
        "anthropic_api_key_configurada": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "diretorio_skills_encontrado": (PROJECT_DIR / ".claude" / "skills").is_dir(),
        "diretorio_agents_encontrado": (PROJECT_DIR / ".claude" / "agents").is_dir(),
    }


@app.get("/api/log")
def consultar_log(identificador: str = None):
    """Consulta o log de gerações. Sem parâmetro `identificador`,
    retorna todos os registros; com ele, filtra por CPF/CNPJ (busca
    parcial, sem diferenciar maiúsculas/minúsculas)."""
    entradas = ler_entradas_log(identificador)
    return {
        "total": len(entradas),
        "entradas": entradas,
        "markdown": renderizar_log_markdown(entradas, identificador),
    }


@app.post("/api/gerar-documento")
async def gerar_documento(req: GerarDocumentoRequest):
    if not req.tipoDocumento or not req.levantamento:
        raise HTTPException(status_code=400, detail="tipoDocumento e levantamento são obrigatórios.")

    identificador = extrair_identificador(req.levantamento)

    prompt = f"""
Gere um documento do tipo "{req.tipoDocumento}" usando a skill
gerador-documentos-juridicos.

Respostas confirmadas do levantamento (não pergunte de novo, use estas):
{json.dumps(req.levantamento, indent=2, ensure_ascii=False)}

Siga rigorosamente o fluxo coordenador → subagentes descrito no SKILL.md
da skill: delegue a redação para a subagente redator-clausulas, a
revisão para revisor-conformidade (que deve rodar independente, sem ver
o raciocínio da redação), e só chame montador-documento depois de um
veredito PRONTO PARA ENTREGA. Se a revisão reprovar, volte para
redator-clausulas com os motivos específicos e repita até aprovar.

Ao final, responda em texto com o documento final completo seguido de
"---RELATORIO_REVISAO---" e o relatório de revisão.
""".strip()

    texto_final = ""
    logger.info("Iniciando geração: tipo=%s identificador=%s", req.tipoDocumento, identificador)

    try:
        async for message in query(
            prompt=prompt,
            options=ClaudeAgentOptions(
                cwd=str(PROJECT_DIR),
                # "project" faz o SDK carregar .claude/agents/ e
                # .claude/skills/ automaticamente, como o Claude Code
                # CLI faria numa sessão interativa
                setting_sources=["project"],
                # Task é obrigatório para que a delegação a subagentes
                # sequer aconteça
                allowed_tools=["Task", "Read", "Grep", "Glob", "Write", "Bash"],
                # Em produção, prefira um modo mais restrito
                permission_mode="acceptEdits",
            ),
        ):
            tipo_msg = type(message).__name__
            logger.info("Mensagem recebida: %s", tipo_msg)

            if hasattr(message, "result"):
                texto_final = message.result

    except Exception as erro:
        logger.exception("Falha ao gerar documento")
        registrar_log({
            "tipo_documento": req.tipoDocumento,
            "identificador": identificador,
            "status": "falha",
            "motivo_falha": str(erro),
            "temas_juridicos": [],
        })
        raise HTTPException(status_code=500, detail=f"Falha ao gerar documento: {erro}")

    logger.info("Geração concluída: tipo=%s", req.tipoDocumento)

    if "---RELATORIO_REVISAO---" in texto_final:
        documento, relatorio = texto_final.split("---RELATORIO_REVISAO---", 1)
    else:
        documento, relatorio = texto_final, ""

    documento = documento.strip()
    relatorio = relatorio.strip()

    if "NECESSITA REVIS" in relatorio.upper() and "PRONTO PARA ENTREGA" not in relatorio.upper():
        registrar_log({
            "tipo_documento": req.tipoDocumento,
            "identificador": identificador,
            "status": "falha",
            "motivo_falha": "Revisão não aprovou o documento (NECESSITA REVISÃO).",
            "temas_juridicos": extrair_temas_juridicos(documento),
        })
        return {
            "status": "NECESSITA_REVISAO_HUMANA",
            "motivo": "A revisão automática não aprovou o documento.",
            "ultimaMinuta": documento,
            "relatorioRevisao": relatorio,
        }

    temas_juridicos = extrair_temas_juridicos(documento)
    registrar_log({
        "tipo_documento": req.tipoDocumento,
        "identificador": identificador,
        "status": "sucesso",
        "temas_juridicos": temas_juridicos,
    })

    return {
        "status": "PRONTO",
        "documento": documento,
        "relatorioRevisao": relatorio,
        "temasJuridicos": temas_juridicos,
    }


if __name__ == "__main__":
    import uvicorn

    porta = int(os.environ.get("PORT", 3001))
    logger.info("Backend (Agent SDK) rodando em http://localhost:%d", porta)
    uvicorn.run(app, host="0.0.0.0", port=porta)
