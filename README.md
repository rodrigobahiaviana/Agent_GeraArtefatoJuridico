# Gerador de Documentos Jurídicos — Backend Python (Agent SDK) + Frontend React

Aplicação que gera minutas de documentos jurídicos brasileiros
(confidencialidade, locação, trabalho CLT, prestação de serviços PJ)
usando o **Claude Agent SDK** em Python, com um fluxo de coordenador +
3 subagentes (redação → revisão independente → montagem final),
upload de arquivos `.csv`/`.md` para geração em lote (até 10 por vez),
e um **log de gerações consultável por CPF/CNPJ**.

```
legal-doc-app/
├── backend/     ← Python (FastAPI + claude-agent-sdk)
│   ├── .claude/
│   ├── log/      ← criado automaticamente (registro.jsonl)
│   └── server.py
└── frontend/    ← React
```

---

## 1. Como funciona

### 1.1 O que é o Agent SDK

O Agent SDK é o mesmo motor que roda o Claude Code, exposto como
biblioteca Python (`claude-agent-sdk`). A diferença central em relação
a chamar a API do Claude diretamente: o Agent SDK **executa sozinho**
um laço completo de agente — ele lê arquivos, decide quando delegar
tarefas a subagentes, e continua trabalhando até ter uma resposta
final, sem que seu código precise orquestrar cada etapa manualmente.

Ele funciona lendo uma pasta `.claude/` dentro do projeto, exatamente
como o Claude Code faria numa sessão de terminal:

```
.claude/
├── agents/                                    ← subagentes (arquivos .md)
│   ├── redator-clausulas.md
│   ├── revisor-conformidade.md
│   └── montador-documento.md
└── skills/
    └── gerador-documentos-juridicos/
        ├── SKILL.md                            ← instruções + fluxo
        ├── references/                         ← regras por tipo de documento
        └── assets/templates/                   ← modelos com {{variáveis}}
```

### 1.2 O fluxo de execução, passo a passo

Quando o backend recebe um pedido do React (`tipoDocumento` +
`levantamento`), ele faz **uma única chamada** à função `query()` do
SDK. A partir daí, tudo que acontece é decidido pelo próprio agente,
seguindo as instruções do `SKILL.md`:

1. **Coordenador (agente principal)** lê o prompt, identifica que a
   skill `gerador-documentos-juridicos` se aplica, e carrega
   `SKILL.md`.
2. O `SKILL.md` instrui o coordenador a delegar a redação. O
   coordenador usa a ferramenta `Task` para acionar a subagente
   **`redator-clausulas`**, passando o tipo de documento e as
   respostas do levantamento.
3. `redator-clausulas` lê `references/<tipo>.md` (o menu de cláusulas
   obrigatórias/opcionais/sinalizadas) e
   `assets/templates/<tipo>_template.md` (a estrutura base), preenche
   as variáveis, e devolve o texto da minuta ao coordenador.
4. O coordenador aciona **`revisor-conformidade`** — numa subtarefa
   nova, que **não recebe o raciocínio da redação**, só a minuta
   pronta e o checklist. Isso é o que torna a revisão uma segunda
   opinião de verdade, e não a mesma linha de raciocínio se
   confirmando.
5. Se a revisão retornar **NECESSITA REVISÃO**, o coordenador volta ao
   passo 2 com os motivos específicos da reprovação. Esse ciclo se
   repete até um veredito **PRONTO PARA ENTREGA**.
6. Só então o coordenador aciona **`montador-documento`**, que formata
   a saída final e registra a entrada de auditoria — sem alterar
   conteúdo de cláusula.
7. O backend intercepta o resultado, extrai os temas jurídicos
   sinalizados (ver seção 1.4) e grava uma entrada no **log de
   gerações** antes de devolver a resposta ao React.

### 1.3 Por que precisa de um backend (e não dá pra chamar direto do React)

Duas razões, cada uma seria suficiente sozinha:

- **Chave de API**: `ANTHROPIC_API_KEY` nunca pode estar em código que
  roda no navegador do usuário — qualquer pessoa abriria o DevTools e
  veria a chave.
- **Runtime nativo**: o Agent SDK empacota um binário do Claude Code e
  precisa de Python rodando num processo de servidor. Não existe
  versão para navegador.

### 1.4 Log de gerações — o que é registrado e por quê

Cada chamada a `/api/gerar-documento` — com sucesso ou falha — grava
uma entrada em `backend/log/registro.jsonl` (uma linha JSON por
geração), com:

- **timestamp** (UTC)
- **tipo de documento**
- **identificador** — CPF/CNPJ extraído automaticamente do
  levantamento (o backend procura em campos comuns como
  `parte_a_documento`, `empregado_cpf`, `contratante_cnpj` etc.)
- **status** — sucesso ou falha, e o motivo quando falha
- **temas jurídicos sinalizados** — ver aviso importante abaixo

**Aviso importante sobre "jurisprudência":** este sistema **nunca
inventa** números de processo, ementas ou citações de jurisprudência
específicas. Modelos de linguagem podem fabricar citações jurídicas
que parecem reais mas não existem — isso já causou problemas sérios em
casos jurídicos de verdade. Em vez disso, o backend extrai os
marcadores `[REVISAR: ...]` que já vêm embutidos no documento gerado
(esses marcadores citam leis e artigos reais, verificados na skill —
ex.: "confirmar proporcionalidade da multa, art. 413 do Código Civil")
e gera, para cada um, um **link de busca** no Jusbrasil
(`jusbrasil.com.br/busca?q=...`). É um ponto de partida de pesquisa
real, nunca uma citação fabricada — sempre verifique o resultado da
busca com um advogado antes de usar.

O endpoint `GET /api/log`:
- Sem parâmetro: retorna **todos** os registros
- Com `?identificador=<CPF ou CNPJ>`: filtra por correspondência
  parcial (não precisa ser exato)
- Resposta inclui o total encontrado, os dados estruturados, e uma
  versão em **Markdown** pronta para exibir ou baixar como arquivo

### 1.5 Detalhes importantes do `ClaudeAgentOptions`

| Opção | Para que serve |
|---|---|
| `cwd` | Aponta para a pasta que contém `.claude/` — é como o SDK sabe onde procurar agents e skills |
| `setting_sources=["project"]` | Faz o SDK carregar `.claude/agents/` e `.claude/skills/` daquele diretório automaticamente |
| `allowed_tools` | **`"Task"` precisa estar na lista** — é a ferramenta que o coordenador usa para acionar subagentes. Sem ela, a delegação nunca acontece |
| `permission_mode` | `"acceptEdits"` é conveniente para desenvolvimento; em produção, avalie restringir por ferramenta |

---

## 2. Instalação e execução

### 2.1 Pré-requisitos

- Uma chave de API da Anthropic — crie em **console.anthropic.com** → API Keys
- **Python 3.10** ou mais recente (para o backend)
- **Node.js 18** ou mais recente (para o frontend React)

```bash
python3 --version
node --version
```

### 2.2 Backend

```bash
cd backend

python3 -m venv venv
source venv/bin/activate            # Windows (PowerShell): venv\Scripts\Activate.ps1

pip install -r requirements.txt

export ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
# Windows (PowerShell): $env:ANTHROPIC_API_KEY="sk-ant-sua-chave-aqui"

python server.py
```

Se tudo certo, aparece:
```
Backend (Agent SDK) rodando em http://localhost:3001
```

Confirme:
```bash
curl http://localhost:3001/api/saude
```
```json
{
  "status": "ok",
  "anthropic_api_key_configurada": true,
  "diretorio_skills_encontrado": true,
  "diretorio_agents_encontrado": true
}
```

**Deixe esse terminal aberto.**

### 2.3 Frontend React

Abra **um novo terminal**:

```bash
npm create vite@latest frontend-app -- --template react
cd frontend-app
npm install
npm install papaparse
```

Copie `GeradorDocumentosJuridicos.jsx` e `App.jsx` (de `frontend/src/`)
para dentro de `src/`, substituindo o `App.jsx` padrão do Vite.

```bash
npm run dev
```

Deve aparecer `http://localhost:5173/`.

### 2.4 Usando a interface

A tela tem dois cartões:

**"Gerar Documentos"** — selecione o tipo de documento, baixe um
modelo `.csv` ou `.md` já com os campos certos para aquele tipo, edite
com seus dados e envie de volta. Formatos aceitos:

CSV (cabeçalho na primeira linha, um registro por linha):
```csv
parte_a_nome,parte_a_documento,parte_b_nome,parte_b_documento,finalidade,prazo_anos
Acme Ltda.,12.345.678/0001-90,Fornecedor XYZ,98.765.432/0001-10,avaliação de parceria,3
```

MD (blocos `## ` seguidos de linhas `chave: valor`):
```markdown
## Registro 1
parte_a_nome: Acme Ltda.
parte_a_documento: 12.345.678/0001-90
```

Depois do upload: pré-visualização em tabela, mensagens de erro
específicas se o arquivo estiver malformado (extensão errada, mais de
10 registros, cabeçalho ausente), barra de progresso durante a geração
em lote, e resultado por registro com botão de download individual e
os temas jurídicos sinalizados (com link de busca no Jusbrasil).

**"Consultar Log de Gerações"** — digite um CPF/CNPJ e clique em
"Buscar", ou clique em "Ver todos os registros" para o histórico
completo. O resultado aparece renderizado e pode ser baixado como
`.md`.

---

## 3. Resumo — dois terminais rodando ao mesmo tempo

| Terminal 1 (backend) | Terminal 2 (frontend) |
|---|---|
| `cd backend && source venv/bin/activate && python server.py` | `cd frontend-app && npm run dev` |
| porta **3001** | porta **5173** |

---

## 4. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `anthropic_api_key_configurada: false` | Variável de ambiente não exportada nesta sessão | Rode `export ANTHROPIC_API_KEY=...` de novo, ou use um `.env` |
| `diretorio_skills_encontrado: false` | Rodou `python server.py` fora da pasta correta | Confirme que `.claude/` está no mesmo nível de `server.py` |
| Subagentes nunca são acionados | `"Task"` não está em `allowed_tools` | Confirme que a lista inclui `"Task"` |
| CORS bloqueando o React | Backend não está rodando | Confirme com `/api/saude` antes de testar pelo React |
| Demora muito para responder | Normal — coordenador + até 3 subagentes, às vezes com ciclo de correção | Acompanhe os logs do terminal do backend |
| `NECESSITA_REVISAO_HUMANA` | Revisão reprovou 3 vezes seguidas | Comportamento esperado — revise manualmente o `ultimaMinuta` |
| `ModuleNotFoundError: claude_agent_sdk` | venv não ativado | Rode `source venv/bin/activate` (prompt deve mostrar `(venv)`) |
| Consulta ao log retorna vazio | Nenhuma geração foi feita ainda, ou identificador não bate | Gere ao menos um documento primeiro; tente "Ver todos os registros" para conferir o identificador exato gravado |

---

## 5. O que falta para produção

- **Autenticação** no backend — hoje os endpoints estão abertos
- **Streaming para o React** durante a geração, mostrando qual
  subagente está rodando em tempo real
- **Geração de `.docx` real**, em vez de markdown puro
- **Log em banco de dados** em vez de arquivo `.jsonl` — funciona bem
  para uso individual/pequena equipe, mas não escala para volume alto
  nem para acesso concorrente de múltiplos processos
- **Gerar em paralelo em vez de sequencial** no lote — hoje processa
  um registro de cada vez
- **Validação de campos obrigatórios por tipo de documento** no
  frontend, antes do envio
- **Hospedar em ambiente de processo longo** (VPS, container, PaaS) —
  evite serverless tradicional
