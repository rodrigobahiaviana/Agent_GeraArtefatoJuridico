import { useState } from "react";
import Papa from "papaparse";

const TIPOS_DOCUMENTO = [
  { id: "confidencialidade", label: "Acordo de Confidencialidade" },
  { id: "locacao", label: "Contrato de Locação" },
  { id: "trabalho", label: "Contrato de Trabalho (CLT)" },
  { id: "prestacao-servicos-pj", label: "Prestação de Serviços (PJ)" },
];

const LIMITE_REGISTROS = 10;
const BACKEND_URL = "http://localhost:3001";

// Dark mode — texto em branco/azul, destaques e botões em amarelo.
const cores = {
  fundo: "#0a0e1a",
  fundoCard: "#121a2e",
  fundoInput: "#0d1420",
  borda: "#2a3554",
  bordaForte: "#3d4a70",
  azul: "#5b9dff",
  azulClaro: "#8fb8ff",
  branco: "#f5f7fb",
  brancoSuave: "#aab4cc",
  amarelo: "#f2c94c",
  amareloClaro: "#f7db7e",
  textoBotao: "#0a0e1a",
  sucesso: "#4ade80",
  sucessoFundo: "rgba(74, 222, 128, 0.10)",
  sucessoBorda: "rgba(74, 222, 128, 0.35)",
  erro: "#f87171",
  erroFundo: "rgba(248, 113, 113, 0.10)",
  erroBorda: "rgba(248, 113, 113, 0.35)",
};

const fontesImport =
  "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&display=swap');";

function parseMarkdown(texto) {
  const erros = [];
  const blocos = texto.split(/^##\s+/m).slice(1);

  if (blocos.length === 0) {
    erros.push(
      'Nenhum registro encontrado. Cada registro deve começar com uma linha "## Nome do registro".'
    );
    return { registros: [], erros };
  }

  const registros = blocos.map((bloco, indice) => {
    const linhas = bloco.split("\n");
    const tituloRegistro = linhas[0].trim() || `Registro ${indice + 1}`;
    const registro = {};

    for (const linha of linhas.slice(1)) {
      const match = linha.match(/^\s*[-*]?\s*([^:]+):\s*(.*)$/);
      if (match) {
        const chave = match[1].trim();
        const valor = match[2].trim();
        if (chave) registro[chave] = valor;
      }
    }

    if (Object.keys(registro).length === 0) {
      erros.push(`"${tituloRegistro}" (registro ${indice + 1}): nenhum campo "chave: valor" encontrado.`);
    }

    return registro;
  });

  return { registros, erros };
}

function parseCSV(texto) {
  const erros = [];
  const resultado = Papa.parse(texto.trim(), { header: true, skipEmptyLines: true });

  if (resultado.errors.length > 0) {
    resultado.errors.forEach((e) => erros.push(`Linha ${e.row + 2}: ${e.message}`));
  }

  if (!resultado.meta.fields || resultado.meta.fields.length === 0) {
    erros.push("Não foi possível identificar o cabeçalho do CSV (primeira linha).");
    return { registros: [], erros };
  }

  const registros = resultado.data.filter((linha) =>
    Object.values(linha).some((v) => String(v).trim() !== "")
  );

  return { registros, erros };
}

function validarRegistros(registros) {
  const erros = [];
  if (registros.length === 0) erros.push("O arquivo não contém nenhum registro válido.");
  if (registros.length > LIMITE_REGISTROS) {
    erros.push(
      `O arquivo contém ${registros.length} registros; o limite é ${LIMITE_REGISTROS} por vez. Divida em arquivos menores.`
    );
  }
  return erros;
}

function gerarModeloCSV(tipoDocumento) {
  const exemplos = {
    confidencialidade:
      "parte_a_nome,parte_a_documento,parte_b_nome,parte_b_documento,finalidade,prazo_anos\nAcme Ltda.,12.345.678/0001-90,Fornecedor XYZ,98.765.432/0001-10,avaliação de parceria,3",
    locacao:
      "locador_nome,locatario_nome,endereco_imovel,valor_aluguel,prazo_meses,modalidade_garantia\nJoão Silva,Maria Souza,Rua A 123,2000,12,caucao",
    trabalho:
      "empregador_razao_social,empregado_nome,cargo,valor_salario,regime_trabalho\nAcme Ltda.,Carlos Lima,Analista de Dados,5000,presencial",
    "prestacao-servicos-pj":
      "contratante_razao_social,contratada_razao_social,descricao_servicos,valor_servicos,prazo_contrato\nAcme Ltda.,Design XYZ Ltda.,identidade visual,15000,45 dias",
  };
  return exemplos[tipoDocumento] || "";
}

function baixarTexto(conteudo, nome, tipo = "text/markdown") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Componentes visuais reutilizáveis ----------

function Cartao({ children, style }) {
  return (
    <div
      style={{
        background: cores.fundoCard,
        border: `1px solid ${cores.borda}`,
        borderRadius: 6,
        padding: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TituloSecao({ children }) {
  return (
    <h2
      style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 20,
        fontWeight: 700,
        color: cores.azul,
        borderBottom: `2px solid ${cores.amarelo}`,
        paddingBottom: 8,
        marginTop: 0,
        marginBottom: 20,
      }}
    >
      {children}
    </h2>
  );
}

function BotaoPrimario({ children, style, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: cores.amarelo,
        color: cores.textoBotao,
        border: "none",
        borderRadius: 4,
        padding: "10px 22px",
        fontWeight: 700,
        fontSize: 14,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        transition: "background 0.15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function BotaoSecundario({ children, style, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: "transparent",
        color: cores.amarelo,
        border: `1px solid ${cores.amarelo}`,
        borderRadius: 4,
        padding: "8px 16px",
        fontWeight: 600,
        fontSize: 13,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---------- Componente principal ----------

export default function GeradorDocumentosJuridicos() {
  const [tipoDocumento, setTipoDocumento] = useState(TIPOS_DOCUMENTO[0].id);
  const [nomeArquivo, setNomeArquivo] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [errosArquivo, setErrosArquivo] = useState([]);
  const [progresso, setProgresso] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [gerando, setGerando] = useState(false);

  // Consulta ao log
  const [identificadorConsulta, setIdentificadorConsulta] = useState("");
  const [logMarkdown, setLogMarkdown] = useState("");
  const [logTotal, setLogTotal] = useState(null);
  const [consultandoLog, setConsultandoLog] = useState(false);
  const [erroConsulta, setErroConsulta] = useState(null);

  // Documentos gerados localmente
  const [documentos, setDocumentos] = useState([]);
  const [documentosTotal, setDocumentosTotal] = useState(null);
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(false);
  const [erroDocumentos, setErroDocumentos] = useState(null);

  async function handleListarDocumentos() {
    setCarregandoDocumentos(true);
    setErroDocumentos(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/documentos`);
      const dados = await resp.json();
      if (!resp.ok) {
        setErroDocumentos(dados.detail || "Falha ao listar documentos.");
      } else {
        setDocumentos(dados.documentos);
        setDocumentosTotal(dados.total);
      }
    } catch {
      setErroDocumentos("Não foi possível conectar ao backend.");
    } finally {
      setCarregandoDocumentos(false);
    }
  }

  async function handleBaixarDocumentoSalvo(caminho, nomeArquivo) {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/documentos/conteudo?caminho=${encodeURIComponent(caminho)}`);
      const dados = await resp.json();
      if (resp.ok) baixarTexto(dados.conteudo, nomeArquivo);
    } catch {
      // usuário pode tentar de novo — sem estado de erro dedicado aqui
    }
  }

  function formatarTamanho(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function formatarData(iso) {
    return new Date(iso).toLocaleString("pt-BR");
  }

  function handleArquivoSelecionado(e) {
    const arquivo = e.target.files[0];
    setResultados([]);
    setProgresso(null);
    if (!arquivo) return;

    setNomeArquivo(arquivo.name);
    const extensao = arquivo.name.split(".").pop().toLowerCase();

    if (extensao !== "csv" && extensao !== "md") {
      setErrosArquivo(['Formato não suportado. Envie um arquivo ".csv" ou ".md".']);
      setRegistros([]);
      return;
    }

    const leitor = new FileReader();
    leitor.onload = (evento) => {
      const texto = evento.target.result;
      const { registros: registrosParseados, erros: errosParse } =
        extensao === "csv" ? parseCSV(texto) : parseMarkdown(texto);

      const errosValidacao = validarRegistros(registrosParseados);
      const todosOsErros = [...errosParse, ...errosValidacao];

      setErrosArquivo(todosOsErros);
      setRegistros(todosOsErros.some((e) => e.includes("limite")) ? [] : registrosParseados);
    };
    leitor.onerror = () => {
      setErrosArquivo(["Não foi possível ler o arquivo. Tente novamente."]);
      setRegistros([]);
    };
    leitor.readAsText(arquivo);
  }

  async function handleGerarTodos() {
    if (registros.length === 0 || errosArquivo.length > 0) return;

    setGerando(true);
    setResultados([]);
    const novosResultados = [];

    for (let i = 0; i < registros.length; i++) {
      setProgresso({ atual: i + 1, total: registros.length });
      try {
        const resp = await fetch(`${BACKEND_URL}/api/gerar-documento`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipoDocumento, levantamento: registros[i] }),
        });
        const dados = await resp.json();
        novosResultados.push({
          indice: i + 1,
          ok: resp.ok && dados.status === "PRONTO",
          dados,
        });
      } catch {
        novosResultados.push({
          indice: i + 1,
          ok: false,
          dados: { erro: "Falha de conexão com o backend." },
        });
      }
    }

    setResultados(novosResultados);
    setProgresso(null);
    setGerando(false);

    if (novosResultados.some((r) => r.ok)) handleListarDocumentos();
  }

  async function handleConsultarLog(todos) {
    setConsultandoLog(true);
    setErroConsulta(null);
    setLogMarkdown("");
    setLogTotal(null);

    try {
      const params = todos || !identificadorConsulta.trim() ? "" : `?identificador=${encodeURIComponent(identificadorConsulta.trim())}`;
      const resp = await fetch(`${BACKEND_URL}/api/log${params}`);
      const dados = await resp.json();

      if (!resp.ok) {
        setErroConsulta(dados.detail || "Falha ao consultar o log.");
      } else {
        setLogMarkdown(dados.markdown);
        setLogTotal(dados.total);
      }
    } catch {
      setErroConsulta("Não foi possível conectar ao backend.");
    } finally {
      setConsultandoLog(false);
    }
  }

  const podeGerar = registros.length > 0 && errosArquivo.length === 0 && !gerando;

  const estiloCampo = {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: 10,
    background: cores.fundoInput,
    color: cores.branco,
    border: `1px solid ${cores.borda}`,
    borderRadius: 4,
    fontSize: 14,
  };

  return (
    <div
      style={{
        background: cores.fundo,
        minHeight: "100vh",
        fontFamily: "'Inter', sans-serif",
        colorScheme: "dark",
      }}
    >
      <style>{fontesImport}</style>

      {/* Cabeçalho estilo plataforma de pesquisa jurídica */}
      <header
        style={{
          background: `linear-gradient(90deg, ${cores.fundo} 0%, ${cores.fundoCard} 100%)`,
          padding: "20px 32px",
          borderBottom: `3px solid ${cores.amarelo}`,
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              color: cores.branco,
              fontSize: 26,
              fontWeight: 700,
              margin: 0,
              letterSpacing: 0.3,
            }}
          >
            Gerador de Documentos Jurídicos
          </h1>
          <p style={{ color: cores.amareloClaro, fontSize: 13, margin: "4px 0 0", letterSpacing: 0.5 }}>
            MINUTAS AUTOMATIZADAS · REVISÃO EM DUAS ETAPAS · RASTREABILIDADE COMPLETA
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 64px", display: "grid", gap: 24 }}>
        {/* Seção 1 — Geração de documentos */}
        <Cartao>
          <TituloSecao>Gerar Documentos</TituloSecao>

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: cores.azulClaro }}>
            Tipo de documento
            <select
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
              style={estiloCampo}
            >
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <BotaoSecundario onClick={() => baixarTexto(gerarModeloCSV(tipoDocumento), `modelo-${tipoDocumento}.csv`, "text/csv")}>
              Baixar modelo .csv
            </BotaoSecundario>
            <BotaoSecundario
              onClick={() => {
                const linhas = gerarModeloCSV(tipoDocumento).split("\n");
                const cabecalhos = linhas[0].split(",");
                const valores = linhas[1].split(",");
                const conteudo = "## Registro 1\n" + cabecalhos.map((c, i) => `${c}: ${valores[i] ?? ""}`).join("\n");
                baixarTexto(conteudo, `modelo-${tipoDocumento}.md`);
              }}
            >
              Baixar modelo .md
            </BotaoSecundario>
          </div>

          <label style={{ display: "block", marginTop: 20, fontSize: 13, fontWeight: 600, color: cores.azulClaro }}>
            Arquivo com os registros (.csv ou .md — até {LIMITE_REGISTROS} registros)
            <input
              type="file"
              accept=".csv,.md"
              onChange={handleArquivoSelecionado}
              style={{ display: "block", marginTop: 8, fontSize: 13, color: cores.brancoSuave }}
            />
          </label>

          {nomeArquivo && errosArquivo.length === 0 && (
            <p style={{ color: cores.sucesso, marginTop: 10, fontSize: 13 }}>
              "{nomeArquivo}" carregado — {registros.length} registro(s) reconhecido(s).
            </p>
          )}

          {errosArquivo.length > 0 && (
            <div style={{ marginTop: 14, padding: 14, background: cores.erroFundo, border: `1px solid ${cores.erroBorda}`, borderRadius: 4 }}>
              <p style={{ color: cores.erro, fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                Não foi possível usar este arquivo:
              </p>
              <ul style={{ color: cores.erro, margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {errosArquivo.map((erro, i) => (
                  <li key={i}>{erro}</li>
                ))}
              </ul>
            </div>
          )}

          {registros.length > 0 && errosArquivo.length === 0 && (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
                <thead>
                  <tr style={{ background: cores.fundoInput }}>
                    <th style={{ border: `1px solid ${cores.borda}`, padding: 6, textAlign: "left", color: cores.azulClaro }}>#</th>
                    {Object.keys(registros[0]).map((chave) => (
                      <th key={chave} style={{ border: `1px solid ${cores.borda}`, padding: 6, textAlign: "left", color: cores.azulClaro }}>
                        {chave}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registros.map((registro, i) => (
                    <tr key={i}>
                      <td style={{ border: `1px solid ${cores.borda}`, padding: 6, color: cores.brancoSuave }}>{i + 1}</td>
                      {Object.keys(registros[0]).map((chave) => (
                        <td key={chave} style={{ border: `1px solid ${cores.borda}`, padding: 6, color: cores.branco }}>
                          {registro[chave]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <BotaoPrimario onClick={handleGerarTodos} disabled={!podeGerar}>
              {gerando ? "Gerando..." : `Gerar ${registros.length || ""} contrato(s)`}
            </BotaoPrimario>
          </div>

          {progresso && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 13, marginBottom: 6, color: cores.brancoSuave }}>
                Gerando contrato {progresso.atual} de {progresso.total}...
              </p>
              <div style={{ background: cores.fundoInput, borderRadius: 8, height: 8, overflow: "hidden", border: `1px solid ${cores.borda}` }}>
                <div
                  style={{
                    width: `${(progresso.atual / progresso.total) * 100}%`,
                    background: cores.amarelo,
                    height: "100%",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          )}

          {resultados.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: cores.azul }}>
                Resultado — {resultados.filter((r) => r.ok).length} de {resultados.length} gerado(s) com sucesso
              </h3>

              {resultados.map((r) => (
                <div
                  key={r.indice}
                  style={{
                    marginTop: 10,
                    padding: 14,
                    borderRadius: 4,
                    background: r.ok ? cores.sucessoFundo : cores.erroFundo,
                    border: `1px solid ${r.ok ? cores.sucessoBorda : cores.erroBorda}`,
                  }}
                >
                  <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: cores.branco }}>
                    Registro {r.indice} — {r.ok ? "gerado" : "falhou"}
                  </p>

                  {r.ok ? (
                    <>
                      {r.dados.arquivoLocal && (
                        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: cores.brancoSuave }}>
                          Salvo localmente em: <code style={{ color: cores.amareloClaro }}>{r.dados.arquivoLocal}</code>
                        </p>
                      )}

                      <BotaoSecundario
                        style={{ marginTop: 8 }}
                        onClick={() => baixarTexto(r.dados.documento, `${tipoDocumento}-registro-${r.indice}.md`)}
                      >
                        Baixar documento
                      </BotaoSecundario>

                      {r.dados.temasJuridicos?.length > 0 && (
                        <div style={{ marginTop: 10, fontSize: 12.5 }}>
                          <p style={{ margin: "0 0 4px", fontWeight: 600, color: cores.azulClaro }}>
                            Temas jurídicos sinalizados (links de busca):
                          </p>
                          <ul style={{ margin: 0, paddingLeft: 18, color: cores.brancoSuave }}>
                            {r.dados.temasJuridicos.map((t, i) => (
                              <li key={i}>
                                {t.tema} —{" "}
                                <a href={t.link_busca_jusbrasil} target="_blank" rel="noreferrer" style={{ color: cores.amarelo }}>
                                  buscar no Jusbrasil
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p style={{ color: cores.erro, fontSize: 13, marginTop: 4 }}>
                        {r.dados.motivo || r.dados.erro || r.dados.detail || "Erro desconhecido."}
                      </p>
                      {r.dados.arquivoLocal && (
                        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: cores.brancoSuave }}>
                          Última minuta (não aprovada) salva em:{" "}
                          <code style={{ color: cores.amareloClaro }}>{r.dados.arquivoLocal}</code>
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Cartao>

        {/* Seção 2 — Documentos gerados localmente (arquivos .md em documentos_gerados/) */}
        <Cartao>
          <TituloSecao>Documentos Gerados</TituloSecao>

          <p style={{ fontSize: 13, color: cores.brancoSuave, marginTop: -8, marginBottom: 16 }}>
            Toda geração (aprovada ou não) grava um arquivo <code style={{ color: cores.amareloClaro }}>.md</code> em{" "}
            <code style={{ color: cores.amareloClaro }}>documentos_gerados/&lt;tipo&gt;/</code> no servidor. Esta
            lista é separada do log de auditoria abaixo — aqui é o arquivo em si.
          </p>

          <BotaoSecundario onClick={handleListarDocumentos} disabled={carregandoDocumentos}>
            {carregandoDocumentos ? "Carregando..." : "Atualizar lista"}
          </BotaoSecundario>

          {erroDocumentos && (
            <p style={{ marginTop: 12, fontSize: 13, color: cores.erro }}>{erroDocumentos}</p>
          )}

          {documentosTotal !== null && (
            <p style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: cores.azulClaro }}>
              {documentosTotal} arquivo(s) encontrado(s)
            </p>
          )}

          {documentos.length > 0 && (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
                <thead>
                  <tr style={{ background: cores.fundoInput }}>
                    <th style={{ border: `1px solid ${cores.borda}`, padding: 6, textAlign: "left", color: cores.azulClaro }}>Tipo</th>
                    <th style={{ border: `1px solid ${cores.borda}`, padding: 6, textAlign: "left", color: cores.azulClaro }}>Arquivo</th>
                    <th style={{ border: `1px solid ${cores.borda}`, padding: 6, textAlign: "left", color: cores.azulClaro }}>Modificado em</th>
                    <th style={{ border: `1px solid ${cores.borda}`, padding: 6, textAlign: "left", color: cores.azulClaro }}>Tamanho</th>
                    <th style={{ border: `1px solid ${cores.borda}`, padding: 6, textAlign: "left", color: cores.azulClaro }}></th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((doc) => (
                    <tr key={doc.caminho}>
                      <td style={{ border: `1px solid ${cores.borda}`, padding: 6, color: cores.branco }}>{doc.tipoDocumento}</td>
                      <td style={{ border: `1px solid ${cores.borda}`, padding: 6, color: cores.branco }}>{doc.nomeArquivo}</td>
                      <td style={{ border: `1px solid ${cores.borda}`, padding: 6, color: cores.brancoSuave }}>{formatarData(doc.modificadoEm)}</td>
                      <td style={{ border: `1px solid ${cores.borda}`, padding: 6, color: cores.brancoSuave }}>{formatarTamanho(doc.tamanhoBytes)}</td>
                      <td style={{ border: `1px solid ${cores.borda}`, padding: 6 }}>
                        <BotaoSecundario
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => handleBaixarDocumentoSalvo(doc.caminho, doc.nomeArquivo)}
                        >
                          Baixar
                        </BotaoSecundario>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        {/* Seção 3 — Consulta ao log de gerações */}
        <Cartao>
          <TituloSecao>Consultar Log de Gerações</TituloSecao>

          <p style={{ fontSize: 13, color: cores.brancoSuave, marginTop: -8, marginBottom: 16 }}>
            Cada geração (sucesso ou falha) fica registrada com identificador (CPF/CNPJ), status,
            arquivo local salvo e temas jurídicos sinalizados. Busque por identificador ou veja o
            histórico completo.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="CPF ou CNPJ"
              value={identificadorConsulta}
              onChange={(e) => setIdentificadorConsulta(e.target.value)}
              style={{
                flex: "1 1 220px",
                padding: 10,
                background: cores.fundoInput,
                color: cores.branco,
                border: `1px solid ${cores.borda}`,
                borderRadius: 4,
                fontSize: 14,
              }}
            />
            <BotaoPrimario onClick={() => handleConsultarLog(false)} disabled={consultandoLog || !identificadorConsulta.trim()}>
              Buscar
            </BotaoPrimario>
            <BotaoSecundario onClick={() => handleConsultarLog(true)} disabled={consultandoLog}>
              Ver todos os registros
            </BotaoSecundario>
          </div>

          {consultandoLog && <p style={{ marginTop: 12, fontSize: 13, color: cores.brancoSuave }}>Consultando...</p>}

          {erroConsulta && (
            <p style={{ marginTop: 12, fontSize: 13, color: cores.erro }}>{erroConsulta}</p>
          )}

          {logMarkdown && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: cores.azulClaro, margin: 0 }}>
                  {logTotal} registro(s) encontrado(s)
                </p>
                <BotaoSecundario
                  onClick={() =>
                    baixarTexto(
                      logMarkdown,
                      identificadorConsulta.trim() ? `log-${identificadorConsulta.trim()}.md` : "log-completo.md"
                    )
                  }
                >
                  Baixar log (.md)
                </BotaoSecundario>
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  background: cores.fundoInput,
                  color: cores.branco,
                  border: `1px solid ${cores.borda}`,
                  borderRadius: 4,
                  padding: 16,
                  fontSize: 12.5,
                  fontFamily: "'Inter', monospace",
                  maxHeight: 400,
                  overflowY: "auto",
                }}
              >
                {logMarkdown}
              </pre>
            </div>
          )}
        </Cartao>
      </main>
    </div>
  );
}
