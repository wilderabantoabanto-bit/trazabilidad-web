const SUPABASE_URL = "https://kqbetryygymtsyhsowxj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QRC-82FH-YC2znJDSicb3Q_u82tcaHP";

const TIEMPO_AUTOGUARDADO_MS = 1200;
const MIN_FOLIO_AUTOGUARDADO = 6;
const MINUTOS_CENTRIFUGACION = 10;
const HISTORIAL_PAGE_SIZE = 25;

const AREAS_DESTINO = [
  "BIOQUÍMICA",
  "HEMATOLOGÍA",
  "COAGULOMETRÍA",
  "INMUNOLOGÍA",
  "MICROBIOLOGÍA"
];

let supabaseClient;
let registroActual = null;
let folioActual = "";
let ultimoGuardado = null;
let autosaveTimerRegistro = null;
let autosaveTimerAvance = null;
let hashUltimoRegistroGuardado = "";
let guardadoFinalEnProceso = false;
let avanceEnProceso = false;
let historialPaginaActual = 0;
let historialTotal = 0;
let historialCargadoPrimeraVez = false;

const selected = {
  enfermedades: [],
  detalles_adicionales: [],
  tipos_muestra: [],
  recipientes: []
};

window.addEventListener("DOMContentLoaded", () => {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  crearModalContinuar();
  crearModalHojaTrazabilidad();
  instalarEstilosHojaTrazabilidad();

  document.querySelectorAll(".menu-card").forEach(button => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
      if (button.dataset.view === "historial" && !historialCargadoPrimeraVez) {
        cargarHistorial(true);
      }
    });
  });

  document.getElementById("btnIrRegistrar")?.addEventListener("click", () => showView("registrar"));
  document.getElementById("btnIrBuscar")?.addEventListener("click", () => showView("buscar"));
  document.getElementById("btnIrHistorial")?.addEventListener("click", () => {
    showView("historial");
    if (!historialCargadoPrimeraVez) cargarHistorial(true);
  });

  document.getElementById("btnBuscar")?.addEventListener("click", buscarRegistro);
  document.getElementById("btnLimpiar")?.addEventListener("click", limpiarFormulario);
  document.getElementById("formRegistro")?.addEventListener("submit", guardarRegistro);

  const formRegistro = document.getElementById("formRegistro");
  if (formRegistro) {
    formRegistro.addEventListener("input", programarAutoGuardadoRegistro);
    formRegistro.addEventListener("change", programarAutoGuardadoRegistro);
  }

  document.getElementById("requiereFicha")?.addEventListener("change", manejarFicha);
  document.getElementById("enfermedadCronica")?.addEventListener("change", manejarEnfermedad);
  document.getElementById("origenRegistro")?.addEventListener("change", manejarOrigen);

  const inputFolio = document.getElementById("inputFolio");
  if (inputFolio) {
    inputFolio.addEventListener("input", () => {
      folioActual = inputFolio.value.trim();
      actualizarPanelFolio();
    });

    inputFolio.addEventListener("paste", () => {
      setTimeout(() => {
        folioActual = inputFolio.value.trim();
        actualizarPanelFolio();
        programarAutoGuardadoRegistro();
      }, 50);
    });
  }

  const btnCopiarFolioActual = document.getElementById("btnCopiarFolioActual");
  if (btnCopiarFolioActual) {
    btnCopiarFolioActual.addEventListener("click", () => {
      if (folioActual) copiarFolio(folioActual);
    });
  }

  document.querySelectorAll("[data-chip]").forEach(btn => {
    btn.addEventListener("click", () => toggleChip(btn));
  });

  document.querySelector('[name="tipo_muestra_otros"]')?.addEventListener("input", () => {
    actualizarOcultos();
    programarAutoGuardadoRegistro();
  });

  document.querySelector('[name="recipiente_otros"]')?.addEventListener("input", () => {
    actualizarOcultos();
    renderCentrifugacion();
    programarAutoGuardadoRegistro();
  });

  configurarHistorial();
  actualizarPanelFolio();
});

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".menu-card").forEach(b => b.classList.remove("active"));

  document.getElementById(viewId)?.classList.add("active");

  const btn = document.querySelector(`[data-view="${viewId}"]`);
  if (btn) btn.classList.add("active");
}

function actualizarPanelFolio(estado = null) {
  const folioTexto = document.getElementById("folioActualTexto");
  const estadoTexto = document.getElementById("estadoActualTexto");
  const ultimoTexto = document.getElementById("ultimoGuardadoTexto");
  const btnCopiar = document.getElementById("btnCopiarFolioActual");

  if (!folioTexto || !estadoTexto || !ultimoTexto || !btnCopiar) return;

  if (folioActual) {
    folioTexto.textContent = folioActual;
    btnCopiar.disabled = false;
  } else {
    folioTexto.textContent = "Sin folio todavía";
    btnCopiar.disabled = true;
  }

  if (estado) {
    estadoTexto.textContent = estado;
  }

  if (ultimoGuardado) {
    ultimoTexto.textContent = ultimoGuardado.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } else {
    ultimoTexto.textContent = "Pendiente";
  }
}

function marcarGuardadoCorrecto(estadoTexto = "ABIERTO") {
  ultimoGuardado = new Date();
  actualizarPanelFolio(estadoTexto);
}

function manejarFicha() {
  const valor = document.getElementById("requiereFicha")?.value;
  document.getElementById("bloquePreanalitica")?.classList.toggle("hidden", valor !== "SI");
}

function manejarEnfermedad() {
  const valor = document.getElementById("enfermedadCronica")?.value;
  document.getElementById("chipsEnfermedades")?.classList.toggle("hidden", valor !== "SI");
}

function manejarOrigen() {
  const valor = document.getElementById("origenRegistro")?.value;
  document.getElementById("origenOtrosBox")?.classList.toggle("hidden", valor !== "OTROS");
}

function toggleChip(btn) {
  const grupo = btn.dataset.chip;
  const valor = btn.dataset.value;

  if (!selected[grupo]) selected[grupo] = [];

  if (selected[grupo].includes(valor)) {
    selected[grupo] = selected[grupo].filter(item => item !== valor);
    btn.classList.remove("selected");
  } else {
    selected[grupo].push(valor);
    btn.classList.add("selected");
  }

  manejarCajasOtros();
  actualizarOcultos();

  if (grupo === "recipientes") {
    renderCentrifugacion();
  }

  programarAutoGuardadoRegistro();
}

function manejarCajasOtros() {
  document.getElementById("enfermedadOtrosBox")?.classList.toggle("hidden", !selected.enfermedades.includes("Otros"));
  document.getElementById("detallesOtrosBox")?.classList.toggle("hidden", !selected.detalles_adicionales.includes("Otros"));
  document.getElementById("muestraOtrosBox")?.classList.toggle("hidden", !selected.tipos_muestra.includes("Otros"));
  document.getElementById("recipienteOtrosBox")?.classList.toggle("hidden", !selected.recipientes.includes("Otros"));

  renderCentrifugacion();
}

function valorInput(name) {
  const input = document.querySelector(`[name="${name}"]`);
  return input ? input.value.trim() : "";
}

function getTiposMuestraFinales() {
  const muestraOtros = valorInput("tipo_muestra_otros");
  let lista = [...selected.tipos_muestra];

  if (muestraOtros) {
    lista = lista.filter(x => x !== "Otros");
    lista.push(muestraOtros);
  }

  return lista;
}

function getRecipientesFinales() {
  const recipienteOtros = valorInput("recipiente_otros");
  let lista = [...selected.recipientes];

  if (recipienteOtros) {
    lista = lista.filter(x => x !== "Otros");
    lista.push(recipienteOtros);
  }

  return lista;
}

function actualizarOcultos() {
  const tipos = document.getElementById("tipos_muestra");
  const recipientes = document.getElementById("recipientes");
  const enfermedades = document.getElementById("enfermedades");
  const detalles = document.getElementById("detalles_adicionales");

  if (tipos) tipos.value = JSON.stringify(getTiposMuestraFinales());
  if (recipientes) recipientes.value = JSON.stringify(getRecipientesFinales());
  if (enfermedades) enfermedades.value = JSON.stringify(selected.enfermedades);
  if (detalles) detalles.value = JSON.stringify(selected.detalles_adicionales);
}

function renderCentrifugacion() {
  const box = document.getElementById("tablaCentrifugacion");
  if (!box) return;

  const recipientesFinales = getRecipientesFinales();

  if (recipientesFinales.length === 0) {
    box.innerHTML = "Selecciona recipientes arriba para generar la tabla.";
    return;
  }

  box.innerHTML = `
    <table class="mini-table">
      <thead>
        <tr>
          <th>Recipiente</th>
          <th>¿Requiere Centrifugación?</th>
          <th>Hora</th>
        </tr>
      </thead>
      <tbody>
        ${recipientesFinales.map((rec, index) => `
          <tr>
            <td>${limpiarHTML(rec)}</td>
            <td>
              <select data-centri="${index}" data-field="requiere_centrifugacion">
                <option value="">--</option>
                <option>SI</option>
                <option>NO</option>
                <option>NO APLICA</option>
              </select>
            </td>
            <td>
              <input type="time" data-centri="${index}" data-field="hora" />
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function obtenerCentrifugacion() {
  const recipientesFinales = getRecipientesFinales();

  return recipientesFinales.map((rec, index) => {
    const campos = document.querySelectorAll(`[data-centri="${index}"]`);
    const item = { recipiente: rec };

    campos.forEach(campo => {
      item[campo.dataset.field] = campo.value || null;
    });

    return item;
  });
}

function prepararDataRegistro(formulario) {
  actualizarOcultos();

  const formData = new FormData(formulario);
  const data = Object.fromEntries(formData.entries());

  const origenOtros = valorInput("origen_otros");
  const enfermedadOtros = valorInput("enfermedad_otros");

  if (data.origen_registro === "OTROS" && origenOtros) {
    data.origen_registro = "OTROS: " + origenOtros;
  }

  data.folio = (data.folio || "").trim();
  data.tipos_muestra = getTiposMuestraFinales();
  data.recipientes = getRecipientesFinales();
  data.enfermedades = [...selected.enfermedades];
  data.detalles_adicionales = [...selected.detalles_adicionales];

  if (enfermedadOtros) {
    data.enfermedades = data.enfermedades.filter(x => x !== "Otros");
    data.enfermedades.push(enfermedadOtros);
  }

  data.centrifugacion = obtenerCentrifugacion();
  data.updated_at = new Date().toISOString();

  delete data.origen_otros;
  delete data.enfermedad_otros;
  delete data.tipo_muestra_otros;
  delete data.recipiente_otros;

  Object.keys(data).forEach(key => {
    if (data[key] === "") data[key] = null;
  });

  return data;
}

async function obtenerEstadoExistente(folio) {
  if (!folio) return null;

  const { data, error } = await supabaseClient
    .from("trazabilidad")
    .select("estado")
    .eq("folio", folio)
    .maybeSingle();

  if (error) {
    console.warn("No se pudo verificar el estado del folio:", error.message);
    return null;
  }

  return data?.estado || null;
}

function programarAutoGuardadoRegistro() {
  if (guardadoFinalEnProceso) return;

  const inputFolio = document.getElementById("inputFolio");
  folioActual = inputFolio ? inputFolio.value.trim() : folioActual;
  actualizarPanelFolio();

  clearTimeout(autosaveTimerRegistro);

  if (!folioActual || folioActual.length < MIN_FOLIO_AUTOGUARDADO) return;

  autosaveTimerRegistro = setTimeout(realizarAutoGuardadoRegistro, TIEMPO_AUTOGUARDADO_MS);
}

async function realizarAutoGuardadoRegistro() {
  if (guardadoFinalEnProceso) return;

  const form = document.getElementById("formRegistro");
  const mensaje = document.getElementById("mensajeRegistro");
  if (!form || !mensaje) return;

  const data = prepararDataRegistro(form);

  if (!data.folio || data.folio.length < MIN_FOLIO_AUTOGUARDADO) return;

  const hashActual = JSON.stringify(data);
  if (hashActual === hashUltimoRegistroGuardado) return;

  mensaje.textContent = "Autoguardando borrador...";
  mensaje.style.color = "#172033";
  actualizarPanelFolio("Autoguardando...");

  const estadoExistente = await obtenerEstadoExistente(data.folio);

  if ((estadoExistente || "").toUpperCase() === "CERRADO") {
    mensaje.textContent = "Este folio está CERRADO. No se puede modificar desde registro.";
    mensaje.style.color = "crimson";
    actualizarPanelFolio("CERRADO");
    return;
  }

  data.estado = estadoExistente || "ABIERTO";

  const { error } = await supabaseClient
    .from("trazabilidad")
    .upsert([data], { onConflict: "folio" });

  if (error) {
    mensaje.textContent = "Error en autoguardado: " + error.message;
    mensaje.style.color = "crimson";
    actualizarPanelFolio("Error al guardar");
    return;
  }

  hashUltimoRegistroGuardado = hashActual;
  marcarGuardadoCorrecto(data.estado);
  mensaje.textContent = "Borrador autoguardado.";
  mensaje.style.color = "#17804b";
}

async function guardarRegistro(e) {
  e.preventDefault();
  clearTimeout(autosaveTimerRegistro);

  const mensaje = document.getElementById("mensajeRegistro");
  mensaje.textContent = "Guardando...";
  mensaje.style.color = "#172033";

  guardadoFinalEnProceso = true;

  const data = prepararDataRegistro(e.target);

  if (!data.folio) {
    mensaje.textContent = "Falta ingresar el folio.";
    mensaje.style.color = "crimson";
    guardadoFinalEnProceso = false;
    return;
  }

  folioActual = data.folio;
  actualizarPanelFolio("Guardando...");

  const estadoExistente = await obtenerEstadoExistente(data.folio);

  if ((estadoExistente || "").toUpperCase() === "CERRADO") {
    mensaje.textContent = "Este folio ya está CERRADO. No se puede modificar desde registro.";
    mensaje.style.color = "crimson";
    actualizarPanelFolio("CERRADO");
    guardadoFinalEnProceso = false;
    return;
  }

  data.estado = estadoExistente || "ABIERTO";

  const { error } = await supabaseClient
    .from("trazabilidad")
    .upsert([data], { onConflict: "folio" });

  guardadoFinalEnProceso = false;

  if (error) {
    mensaje.textContent = "Error al guardar: " + error.message;
    mensaje.style.color = "crimson";
    actualizarPanelFolio("Error al guardar");
    return;
  }

  hashUltimoRegistroGuardado = JSON.stringify(data);
  marcarGuardadoCorrecto(data.estado);

  mensaje.innerHTML = `
    <div class="success-content">
      <strong>Registro guardado correctamente.</strong>
      <span>Folio: ${limpiarHTML(data.folio)}</span>
      <div class="mini-actions">
        <button type="button" onclick="copiarFolio('${limpiarAtributo(data.folio)}')">Copiar folio</button>
        <button type="button" onclick="abrirContinuarPorFolio('${limpiarAtributo(data.folio)}')">Continuar trazabilidad</button>
        <button type="button" onclick="verHojaTrazabilidadPorFolio('${limpiarAtributo(data.folio)}')">Ver hoja completa / PDF</button>
        <button type="button" class="secondary" onclick="limpiarFormulario()">Nuevo registro</button>
      </div>
    </div>
  `;
  mensaje.style.color = "green";
}

function limpiarFormulario() {
  clearTimeout(autosaveTimerRegistro);
  document.getElementById("formRegistro")?.reset();

  selected.enfermedades = [];
  selected.detalles_adicionales = [];
  selected.tipos_muestra = [];
  selected.recipientes = [];

  folioActual = "";
  ultimoGuardado = null;
  hashUltimoRegistroGuardado = "";

  document.querySelectorAll(".chips button").forEach(btn => btn.classList.remove("selected"));

  document.getElementById("bloquePreanalitica")?.classList.add("hidden");
  document.getElementById("chipsEnfermedades")?.classList.add("hidden");
  document.getElementById("origenOtrosBox")?.classList.add("hidden");
  document.getElementById("enfermedadOtrosBox")?.classList.add("hidden");
  document.getElementById("detallesOtrosBox")?.classList.add("hidden");
  document.getElementById("muestraOtrosBox")?.classList.add("hidden");
  document.getElementById("recipienteOtrosBox")?.classList.add("hidden");

  actualizarOcultos();
  renderCentrifugacion();
  actualizarPanelFolio("Registro inicial");

  const mensaje = document.getElementById("mensajeRegistro");
  if (mensaje) {
    mensaje.textContent = "Sin guardar";
    mensaje.style.color = "#64748b";
  }
}

async function buscarRegistro() {
  const folio = document.getElementById("buscarFolio").value.trim();
  const contenedor = document.getElementById("resultadoBusqueda");

  if (!folio) {
    contenedor.innerHTML = "<p>Escribe un folio para buscar.</p>";
    return;
  }

  contenedor.innerHTML = "<p>Buscando...</p>";

  const { data, error } = await supabaseClient
    .from("trazabilidad")
    .select("*")
    .ilike("folio", `%${folio}%`)
    .order("created_at", { ascending: false });

  if (error) {
    contenedor.innerHTML = `<div class="errorbox">Error al buscar: ${limpiarHTML(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron registros.</p>";
    return;
  }

  contenedor.innerHTML = data.map(reg => `
    <div class="result-card">
      <div class="result-head">
        <div>
          <span class="pill">Folio encontrado</span>
          <h3>${limpiarHTML(reg.folio || "")}</h3>
        </div>
        <span class="state-badge ${claseEstado(reg.estado)}">${limpiarHTML(reg.estado || "SIN ESTADO")}</span>
      </div>

      <div class="result-grid">
        <p><b>Origen:</b> ${limpiarHTML(reg.origen_registro || "")}</p>
        <p><b>Requiere ficha:</b> ${limpiarHTML(reg.requiere_ficha || "")}</p>
        <p><b>Responsable:</b> ${limpiarHTML(reg.responsable || "")}</p>
        <p><b>Sede:</b> ${limpiarHTML(reg.sede || "")}</p>
        <p><b>Muestras:</b> ${limpiarHTML(listaTexto(reg.tipos_muestra))}</p>
        <p><b>Recipientes:</b> ${limpiarHTML(listaTexto(reg.recipientes))}</p>
        <p><b>Creado:</b> ${formatearFecha(reg.created_at)}</p>
        <p><b>Última actualización:</b> ${formatearFecha(reg.updated_at)}</p>
      </div>

      <div class="hero-actions">
        <button type="button" onclick="copiarFolio('${limpiarAtributo(reg.folio || "")}')">Copiar folio</button>
        <button type="button" onclick="abrirContinuarPorFolio('${limpiarAtributo(reg.folio || "")}')">Continuar trazabilidad</button>
        <button type="button" onclick="verHojaTrazabilidadPorFolio('${limpiarAtributo(reg.folio || "")}')">Ver hoja completa / PDF</button>
      </div>
    </div>
  `).join("");
}

async function copiarFolio(folio) {
  if (!folio) return;

  try {
    await navigator.clipboard.writeText(folio);
    mostrarAvisoTemporal("Folio copiado: " + folio);
  } catch (error) {
    alert("Folio copiado: " + folio);
  }
}

function mostrarAvisoTemporal(texto) {
  let aviso = document.getElementById("toastAviso");

  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "toastAviso";
    aviso.className = "toast-aviso";
    document.body.appendChild(aviso);
  }

  aviso.textContent = texto;
  aviso.classList.add("show");

  setTimeout(() => {
    aviso.classList.remove("show");
  }, 2200);
}

async function abrirContinuarPorFolio(folio) {
  const { data, error } = await supabaseClient
    .from("trazabilidad")
    .select("*")
    .eq("folio", folio)
    .single();

  if (error || !data) {
    alert("No se encontró el folio.");
    return;
  }

  registroActual = data;
  cargarModalContinuar(data);
}

function crearModalContinuar() {
  const modal = document.createElement("div");
  modal.id = "modalContinuar";
  modal.className = "hidden";
  modal.innerHTML = `
    <div class="modal-bg">
      <div class="modal-box">
        <div class="form-head">
          <div>
            <span class="pill" id="continuarPill">Continuar trazabilidad</span>
            <h2>Continuar trazabilidad</h2>
          </div>
          <button type="button" class="secondary" onclick="cerrarModalContinuar()">Cerrar</button>
        </div>

        <p id="mensajeContinuar" class="save-status">Borrador cargado</p>

        <div class="section-card">
          <h3>INGRESO A CONTROL</h3>

          <div class="grid-2">
            <label>Hora ingreso a control
              <input id="horaIngresoControl" type="time" />
            </label>

            <label>Responsable ingreso
              <input id="responsableIngreso" placeholder="Nombre del responsable" />
            </label>
          </div>

          <h4>¿Amerita centrifugación?</h4>
          <div id="tablaControl" class="centrifuga-box"></div>
        </div>

        <div class="section-card">
          <h3>ENTREGA AL ÁREA</h3>

          <label>Responsable entrega general
            <input id="responsableEntrega" placeholder="Nombre del responsable" />
          </label>

          <div id="tablaEntrega" class="centrifuga-box"></div>
        </div>

        <div class="section-card">
          <h3>OBSERVACIONES FINALES</h3>
          <textarea id="observacionesFinales" rows="4" placeholder="Escribe observaciones finales si aplica"></textarea>
        </div>

        <div class="actions sticky-actions">
          <button type="button" class="secondary" onclick="cerrarModalContinuar()">Cerrar ventana</button>
          <button type="button" onclick="guardarAvance()">Guardar avance</button>
          <button type="button" onclick="guardarYVerHojaActual()">Ver hoja / PDF</button>
          <button type="button" class="danger-btn" onclick="cerrarFolio()">Cerrar folio</button>
        </div>
      </div>
    </div>
  `;

  modal.addEventListener("click", evento => {
    const chip = evento.target.closest(".area-chip");

    if (chip) {
      chip.classList.toggle("selected");
      programarAutoGuardadoAvance();
    }
  });

  modal.addEventListener("input", evento => {
    if (evento.target.id === "responsableEntrega") {
      sincronizarResponsableEntrega();
    }

    if (evento.target.matches("input, select, textarea")) {
      programarAutoGuardadoAvance();
    }
  });

  modal.addEventListener("change", evento => {
    if (evento.target.id === "responsableEntrega") {
      sincronizarResponsableEntrega();
    }

    if (evento.target.matches("input, select, textarea")) {
      programarAutoGuardadoAvance();
    }
  });

  document.body.appendChild(modal);
}

function cargarModalContinuar(reg) {
  clearTimeout(autosaveTimerAvance);

  document.getElementById("modalContinuar")?.classList.remove("hidden");
  document.getElementById("continuarPill").textContent = "Continuar • Folio: " + reg.folio;

  document.getElementById("horaIngresoControl").value = reg.hora_ingreso_control || "";
  document.getElementById("responsableIngreso").value = reg.responsable_ingreso || "";
  document.getElementById("responsableEntrega").value = reg.responsable_entrega || "";
  document.getElementById("observacionesFinales").value = reg.observaciones_finales || "";

  const mensaje = document.getElementById("mensajeContinuar");
  mensaje.textContent = "Borrador cargado";
  mensaje.style.color = "#64748b";

  renderTablaControl(reg);
  renderTablaEntrega(reg);
}

function cerrarModalContinuar() {
  clearTimeout(autosaveTimerAvance);
  document.getElementById("modalContinuar")?.classList.add("hidden");
}

function renderTablaControl(reg) {
  const recipientes = reg.recipientes || [];
  const guardado = reg.centrifugacion_control || [];
  const box = document.getElementById("tablaControl");

  if (!box) return;

  if (recipientes.length === 0) {
    box.innerHTML = "Este folio no tiene recipientes registrados.";
    return;
  }

  box.innerHTML = `
    <table class="mini-table">
      <thead>
        <tr>
          <th>Recipiente</th>
          <th>¿Centrifuga?</th>
          <th>Ingreso</th>
          <th>Salida automática</th>
        </tr>
      </thead>
      <tbody>
        ${recipientes.map((rec, index) => {
          const item = guardado.find(x => x.recipiente === rec) || {};
          const salida = item.salida || (item.ingreso ? sumarMinutosHora(item.ingreso, MINUTOS_CENTRIFUGACION) : "");

          return `
            <tr>
              <td>${limpiarHTML(rec)}</td>
              <td>
                <select data-control="${index}" data-field="centrifuga">
                  <option value="">--</option>
                  <option ${item.centrifuga === "SI" ? "selected" : ""}>SI</option>
                  <option ${item.centrifuga === "NO" ? "selected" : ""}>NO</option>
                  <option ${item.centrifuga === "NO APLICA" ? "selected" : ""}>NO APLICA</option>
                </select>
              </td>
              <td><input type="time" data-control="${index}" data-field="ingreso" value="${limpiarAtributo(item.ingreso || "")}" /></td>
              <td><input type="time" data-control="${index}" data-field="salida" value="${limpiarAtributo(salida)}" /></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <p class="table-note">La salida se calcula automáticamente sumando ${MINUTOS_CENTRIFUGACION} minutos a la hora de ingreso.</p>
  `;

  configurarAutoSalidaControl();
}

function configurarAutoSalidaControl() {
  document.querySelectorAll('[data-control][data-field="ingreso"]').forEach(input => {
    input.addEventListener("input", () => {
      autocompletarSalidaControl(input.dataset.control);
    });

    input.addEventListener("change", () => {
      autocompletarSalidaControl(input.dataset.control);
    });
  });
}

function autocompletarSalidaControl(index) {
  const ingreso = document.querySelector(`[data-control="${index}"][data-field="ingreso"]`);
  const salida = document.querySelector(`[data-control="${index}"][data-field="salida"]`);
  const centrifuga = document.querySelector(`[data-control="${index}"][data-field="centrifuga"]`);

  if (!ingreso || !salida) return;

  if (!ingreso.value) {
    salida.value = "";
    return;
  }

  salida.value = sumarMinutosHora(ingreso.value, MINUTOS_CENTRIFUGACION);

  if (centrifuga && !centrifuga.value) {
    centrifuga.value = "SI";
  }
}

function sumarMinutosHora(hora, minutos) {
  if (!hora || !hora.includes(":")) return "";

  const [hh, mm] = hora.split(":").map(Number);

  if (Number.isNaN(hh) || Number.isNaN(mm)) return "";

  const fecha = new Date(2000, 0, 1, hh, mm, 0);
  fecha.setMinutes(fecha.getMinutes() + minutos);

  const nuevaHora = String(fecha.getHours()).padStart(2, "0");
  const nuevosMinutos = String(fecha.getMinutes()).padStart(2, "0");

  return `${nuevaHora}:${nuevosMinutos}`;
}

function renderTablaEntrega(reg) {
  const recipientes = reg.recipientes || [];
  const guardado = reg.entrega_area || [];
  const responsableGeneral = reg.responsable_entrega || "";
  const box = document.getElementById("tablaEntrega");

  if (!box) return;

  if (recipientes.length === 0) {
    box.innerHTML = "Este folio no tiene recipientes registrados.";
    return;
  }

  box.innerHTML = `
    <table class="mini-table">
      <thead>
        <tr>
          <th>Recipiente</th>
          <th>Áreas destino</th>
          <th>Hora entrega</th>
          <th>Responsable</th>
        </tr>
      </thead>
      <tbody>
        ${recipientes.map((rec, index) => {
          const item = guardado.find(x => x.recipiente === rec) || {};
          const areasGuardadas = obtenerAreasGuardadas(item);
          const responsableFila = item.responsable || item.responsable_entrega || responsableGeneral || "";

          return `
            <tr>
              <td><b>${limpiarHTML(rec)}</b></td>
              <td>
                <div class="chips table-chips">
                  ${AREAS_DESTINO.map(area => `
                    <button
                      type="button"
                      class="area-chip ${areasGuardadas.includes(area) ? "selected" : ""}"
                      data-entrega="${index}"
                      data-area="${limpiarAtributo(area)}"
                    >${limpiarHTML(area)}</button>
                  `).join("")}
                </div>
              </td>
              <td>
                <input type="time" data-entrega="${index}" data-field="hora" value="${limpiarAtributo(item.hora || "")}" />
              </td>
              <td>
                <input data-entrega="${index}" data-field="responsable" placeholder="Responsable" value="${limpiarAtributo(responsableFila)}" />
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <p class="table-note">Puedes seleccionar una o varias áreas por recipiente. El responsable general se copia automáticamente a cada fila.</p>
  `;
}

function obtenerAreasGuardadas(item) {
  if (Array.isArray(item.areas)) {
    return item.areas;
  }

  if (item.area && typeof item.area === "string") {
    return item.area
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }

  return [];
}

function sincronizarResponsableEntrega() {
  const responsableGeneral = document.getElementById("responsableEntrega").value || "";

  document.querySelectorAll('[data-entrega][data-field="responsable"]').forEach(input => {
    input.value = responsableGeneral;
  });
}

function obtenerControl() {
  const recipientes = registroActual?.recipientes || [];

  return recipientes.map((rec, index) => {
    const campos = document.querySelectorAll(`[data-control="${index}"]`);
    const item = { recipiente: rec };

    campos.forEach(campo => {
      item[campo.dataset.field] = campo.value || null;
    });

    return item;
  });
}

function obtenerEntrega() {
  const recipientes = registroActual?.recipientes || [];

  return recipientes.map((rec, index) => {
    const chipsSeleccionados = document.querySelectorAll(`.area-chip[data-entrega="${index}"].selected`);
    const horaInput = document.querySelector(`[data-entrega="${index}"][data-field="hora"]`);
    const responsableInput = document.querySelector(`[data-entrega="${index}"][data-field="responsable"]`);

    const areas = Array.from(chipsSeleccionados).map(chip => chip.dataset.area);

    return {
      recipiente: rec,
      areas: areas,
      area: areas.join(", "),
      hora: horaInput?.value || null,
      responsable: responsableInput?.value || null
    };
  });
}

function programarAutoGuardadoAvance() {
  if (!registroActual || avanceEnProceso) return;

  clearTimeout(autosaveTimerAvance);

  const mensaje = document.getElementById("mensajeContinuar");
  if (mensaje) {
    mensaje.textContent = "Autoguardando avance...";
    mensaje.style.color = "#172033";
  }

  autosaveTimerAvance = setTimeout(() => guardarAvance(true), TIEMPO_AUTOGUARDADO_MS);
}

async function guardarAvance(silencioso = false) {
  if (!registroActual || avanceEnProceso) return false;

  clearTimeout(autosaveTimerAvance);
  avanceEnProceso = true;

  const mensaje = document.getElementById("mensajeContinuar");

  if (!silencioso && mensaje) {
    mensaje.textContent = "Guardando avance...";
    mensaje.style.color = "#172033";
  }

  const responsableEntregaGeneral = document.getElementById("responsableEntrega")?.value || null;

  const payload = {
    hora_ingreso_control: document.getElementById("horaIngresoControl")?.value || null,
    responsable_ingreso: document.getElementById("responsableIngreso")?.value || null,
    responsable_entrega: responsableEntregaGeneral,
    centrifugacion_control: obtenerControl(),
    entrega_area: obtenerEntrega(),
    observaciones_finales: document.getElementById("observacionesFinales")?.value || null,
    estado: "EN PROCESO",
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from("trazabilidad")
    .update(payload)
    .eq("folio", registroActual.folio);

  avanceEnProceso = false;

  if (error) {
    if (mensaje) {
      mensaje.textContent = "Error al guardar avance: " + error.message;
      mensaje.style.color = "crimson";
    }
    return false;
  }

  registroActual = {
    ...registroActual,
    ...payload
  };

  if (mensaje) {
    mensaje.textContent = silencioso ? "Avance autoguardado." : "Avance guardado correctamente.";
    mensaje.style.color = "green";
  }

  return true;
}

async function guardarYVerHojaActual() {
  if (!registroActual) return;

  const guardado = await guardarAvance(false);

  if (!guardado) {
    alert("No se pudo generar la hoja porque el avance no se guardó correctamente.");
    return;
  }

  await verHojaTrazabilidadPorFolio(registroActual.folio);
}

async function cerrarFolio() {
  if (!registroActual) return;

  const guardado = await guardarAvance(false);

  if (!guardado) {
    alert("No se pudo cerrar el folio porque el avance no se guardó correctamente.");
    return;
  }

  const { error } = await supabaseClient
    .from("trazabilidad")
    .update({
      estado: "CERRADO",
      updated_at: new Date().toISOString()
    })
    .eq("folio", registroActual.folio);

  if (error) {
    alert("Error al cerrar folio: " + error.message);
    return;
  }

  registroActual.estado = "CERRADO";

  alert("Folio cerrado correctamente.");
  cerrarModalContinuar();
  if (document.getElementById("historial")?.classList.contains("active")) cargarHistorial(false);
}

function configurarHistorial() {
  document.getElementById("btnHistorialActualizar")?.addEventListener("click", () => cargarHistorial(true));
  document.getElementById("btnHistorialBuscar")?.addEventListener("click", () => cargarHistorial(true));
  document.getElementById("btnHistorialLimpiar")?.addEventListener("click", limpiarFiltrosHistorial);
  document.getElementById("btnHistorialAnterior")?.addEventListener("click", historialAnterior);
  document.getElementById("btnHistorialSiguiente")?.addEventListener("click", historialSiguiente);

  ["historialFolio", "historialEstado", "historialSede", "historialDesde", "historialHasta"].forEach(id => {
    const elemento = document.getElementById(id);
    if (!elemento) return;

    elemento.addEventListener("keydown", evento => {
      if (evento.key === "Enter") cargarHistorial(true);
    });
  });
}

function obtenerFiltrosHistorial() {
  return {
    folio: document.getElementById("historialFolio")?.value.trim() || "",
    estado: document.getElementById("historialEstado")?.value || "",
    sede: document.getElementById("historialSede")?.value || "",
    desde: document.getElementById("historialDesde")?.value || "",
    hasta: document.getElementById("historialHasta")?.value || ""
  };
}

async function cargarHistorial(resetearPagina = false) {
  const contenedor = document.getElementById("historialResultados");
  const info = document.getElementById("historialInfo");
  const pagina = document.getElementById("historialPagina");

  if (!contenedor) return;

  historialCargadoPrimeraVez = true;

  if (resetearPagina) historialPaginaActual = 0;

  const filtros = obtenerFiltrosHistorial();
  const desdeIndice = historialPaginaActual * HISTORIAL_PAGE_SIZE;
  const hastaIndice = desdeIndice + HISTORIAL_PAGE_SIZE - 1;

  contenedor.innerHTML = `<p class="muted">Cargando historial...</p>`;
  if (info) info.textContent = "Consultando Supabase...";
  if (pagina) pagina.textContent = `Página ${historialPaginaActual + 1}`;
  actualizarBotonesHistorial(true);

  let consulta = supabaseClient
    .from("trazabilidad")
    .select("folio, estado, sede, responsable, tipos_muestra, recipientes, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(desdeIndice, hastaIndice);

  if (filtros.folio) {
    consulta = consulta.ilike("folio", `%${filtros.folio}%`);
  }

  if (filtros.estado) {
    consulta = consulta.eq("estado", filtros.estado);
  }

  if (filtros.sede) {
    consulta = consulta.eq("sede", filtros.sede);
  }

  if (filtros.desde) {
    consulta = consulta.gte("created_at", `${filtros.desde}T00:00:00`);
  }

  if (filtros.hasta) {
    consulta = consulta.lte("created_at", `${filtros.hasta}T23:59:59`);
  }

  const { data, error, count } = await consulta;

  if (error) {
    contenedor.innerHTML = `<div class="errorbox">Error al cargar historial: ${limpiarHTML(error.message)}</div>`;
    if (info) info.textContent = "No se pudo cargar el historial.";
    actualizarBotonesHistorial(false);
    return;
  }

  historialTotal = count || 0;
  renderHistorial(data || []);
  actualizarMetaHistorial(data || []);
  actualizarBotonesHistorial(false);
}

function renderHistorial(registros) {
  const contenedor = document.getElementById("historialResultados");
  if (!contenedor) return;

  if (!registros.length) {
    contenedor.innerHTML = `<p class="muted">No se encontraron folios con esos filtros.</p>`;
    return;
  }

  contenedor.innerHTML = `
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Estado</th>
            <th>Sede</th>
            <th>Responsable</th>
            <th>Muestras</th>
            <th>Recipientes</th>
            <th>Creado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${registros.map(reg => `
            <tr>
              <td><strong>${limpiarHTML(reg.folio || "-")}</strong></td>
              <td><span class="state-badge ${claseEstado(reg.estado)}">${limpiarHTML(reg.estado || "SIN ESTADO")}</span></td>
              <td>${limpiarHTML(reg.sede || "-")}</td>
              <td>${limpiarHTML(reg.responsable || "-")}</td>
              <td>${limpiarHTML(listaTexto(reg.tipos_muestra))}</td>
              <td>${limpiarHTML(listaTexto(reg.recipientes))}</td>
              <td>${formatearFechaCorta(reg.created_at)}</td>
              <td>
                <div class="history-actions">
                  <button type="button" onclick="copiarFolio('${limpiarAtributo(reg.folio || "")}')">Copiar</button>
                  <button type="button" onclick="abrirContinuarPorFolio('${limpiarAtributo(reg.folio || "")}')">Continuar</button>
                  <button type="button" onclick="verHojaTrazabilidadPorFolio('${limpiarAtributo(reg.folio || "")}')">Hoja/PDF</button>
                  <button type="button" class="warning-btn" onclick="anularFolio('${limpiarAtributo(reg.folio || "")}')">Anular</button>
                  <button type="button" class="danger-btn" onclick="eliminarFolioDefinitivo('${limpiarAtributo(reg.folio || "")}')">Eliminar</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function actualizarMetaHistorial(registrosPagina) {
  const info = document.getElementById("historialInfo");
  const pagina = document.getElementById("historialPagina");

  const inicio = historialTotal === 0 ? 0 : historialPaginaActual * HISTORIAL_PAGE_SIZE + 1;
  const fin = Math.min((historialPaginaActual + 1) * HISTORIAL_PAGE_SIZE, historialTotal);
  const totalPaginas = Math.max(1, Math.ceil(historialTotal / HISTORIAL_PAGE_SIZE));

  if (info) {
    info.textContent = historialTotal
      ? `Mostrando ${inicio} - ${fin} de ${historialTotal} folios filtrados.`
      : "No hay folios para mostrar.";
  }

  if (pagina) {
    pagina.textContent = `Página ${historialPaginaActual + 1} de ${totalPaginas}`;
  }
}

function actualizarBotonesHistorial(cargando) {
  const anterior = document.getElementById("btnHistorialAnterior");
  const siguiente = document.getElementById("btnHistorialSiguiente");

  const totalPaginas = Math.max(1, Math.ceil(historialTotal / HISTORIAL_PAGE_SIZE));

  if (anterior) anterior.disabled = cargando || historialPaginaActual <= 0;
  if (siguiente) siguiente.disabled = cargando || historialPaginaActual >= totalPaginas - 1 || historialTotal === 0;
}

function historialAnterior() {
  if (historialPaginaActual <= 0) return;
  historialPaginaActual -= 1;
  cargarHistorial(false);
}

function historialSiguiente() {
  const totalPaginas = Math.max(1, Math.ceil(historialTotal / HISTORIAL_PAGE_SIZE));
  if (historialPaginaActual >= totalPaginas - 1) return;
  historialPaginaActual += 1;
  cargarHistorial(false);
}

function limpiarFiltrosHistorial() {
  const ids = ["historialFolio", "historialEstado", "historialSede", "historialDesde", "historialHasta"];
  ids.forEach(id => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.value = "";
  });

  cargarHistorial(true);
}

async function anularFolio(folio) {
  if (!folio) return;

  const confirmar = confirm(`¿Seguro que deseas ANULAR el folio ${folio}?`);
  if (!confirmar) return;

  const motivo = prompt("Motivo de anulación (opcional):") || "";

  const { data: regActual } = await supabaseClient
    .from("trazabilidad")
    .select("observaciones_finales")
    .eq("folio", folio)
    .maybeSingle();

  const observacionAnterior = regActual?.observaciones_finales || "";
  const notaAnulacion = `ANULACIÓN: ${motivo || "Sin motivo especificado"} - ${new Date().toLocaleString("es-PE")}`;

  const payload = {
    estado: "ANULADO",
    observaciones_finales: observacionAnterior
      ? `${observacionAnterior}

${notaAnulacion}`
      : notaAnulacion,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from("trazabilidad")
    .update(payload)
    .eq("folio", folio);

  if (error) {
    alert("No se pudo anular el folio: " + error.message);
    return;
  }

  mostrarAvisoTemporal("Folio anulado: " + folio);
  cargarHistorial(false);
}

async function eliminarFolioDefinitivo(folio) {
  if (!folio) return;

  const primeraConfirmacion = confirm(`¿Seguro que deseas ELIMINAR DEFINITIVAMENTE el folio ${folio}? Esta acción no se puede deshacer.`);
  if (!primeraConfirmacion) return;

  const segundaConfirmacion = prompt(`Escribe ELIMINAR para confirmar el borrado definitivo del folio ${folio}.`);
  if (segundaConfirmacion !== "ELIMINAR") {
    alert("Eliminación cancelada.");
    return;
  }

  const { error } = await supabaseClient
    .from("trazabilidad")
    .delete()
    .eq("folio", folio);

  if (error) {
    alert("No se pudo eliminar el folio. Si aparece error de RLS, falta activar política DELETE en Supabase. Detalle: " + error.message);
    return;
  }

  mostrarAvisoTemporal("Folio eliminado definitivamente: " + folio);
  cargarHistorial(true);
}

function crearModalHojaTrazabilidad() {
  const modal = document.createElement("div");
  modal.id = "modalHojaTrazabilidad";
  modal.className = "hidden";
  modal.innerHTML = `
    <div class="modal-bg">
      <div class="modal-box hoja-modal-box">
        <div class="form-head no-print">
          <div>
            <span class="pill">Hoja completa</span>
            <h2>Hoja de trazabilidad</h2>
          </div>

          <div class="hero-actions">
            <button type="button" onclick="imprimirHojaTrazabilidad()">Imprimir / Guardar PDF</button>
            <button type="button" class="secondary" onclick="cerrarHojaTrazabilidad()">Cerrar</button>
          </div>
        </div>

        <div id="contenidoHojaTrazabilidad" class="hoja-print"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function verHojaTrazabilidadPorFolio(folio) {
  const modalContinuar = document.getElementById("modalContinuar");
  const continuarAbierto = modalContinuar && !modalContinuar.classList.contains("hidden");

  if (continuarAbierto && registroActual && registroActual.folio === folio && !avanceEnProceso) {
    await guardarAvance(true);
  }

  const modal = document.getElementById("modalHojaTrazabilidad");
  const contenedor = document.getElementById("contenidoHojaTrazabilidad");

  modal.classList.remove("hidden");
  contenedor.innerHTML = `<p class="hoja-loading">Cargando hoja de trazabilidad...</p>`;

  const { data, error } = await supabaseClient
    .from("trazabilidad")
    .select("*")
    .eq("folio", folio)
    .single();

  if (error || !data) {
    contenedor.innerHTML = `<div class="errorbox">No se pudo cargar la hoja del folio.</div>`;
    return;
  }

  contenedor.innerHTML = renderHojaTrazabilidad(data);
}

function cerrarHojaTrazabilidad() {
  document.getElementById("modalHojaTrazabilidad")?.classList.add("hidden");
}

function imprimirHojaTrazabilidad() {
  window.print();
}

function renderHojaTrazabilidad(reg) {
  const centrifugacionInicial = Array.isArray(reg.centrifugacion) ? reg.centrifugacion : [];
  const centrifugacionControl = Array.isArray(reg.centrifugacion_control) ? reg.centrifugacion_control : [];
  const entregaArea = Array.isArray(reg.entrega_area) ? reg.entrega_area : [];

  return `
    <article class="hoja-documento">
      <header class="hoja-header">
        <div>
          <h1>HOJA DE TRAZABILIDAD DE MUESTRA</h1>
          <p>Sistema interno de registro, búsqueda y seguimiento de muestras</p>
        </div>
        <div class="hoja-estado ${claseEstado(reg.estado)}">${limpiarHTML(reg.estado || "SIN ESTADO")}</div>
      </header>

      <section class="hoja-resumen">
        <div>
          <span>Folio</span>
          <strong>${limpiarHTML(reg.folio || "-")}</strong>
        </div>
        <div>
          <span>Sede</span>
          <strong>${limpiarHTML(reg.sede || "-")}</strong>
        </div>
        <div>
          <span>Responsable inicial</span>
          <strong>${limpiarHTML(reg.responsable || "-")}</strong>
        </div>
        <div>
          <span>Fecha de registro</span>
          <strong>${formatearFecha(reg.created_at)}</strong>
        </div>
        <div>
          <span>Última actualización</span>
          <strong>${formatearFecha(reg.updated_at)}</strong>
        </div>
      </section>

      <section class="hoja-section">
        <h2>1. Ficha preanalítica / clasificación inicial</h2>
        <div class="hoja-grid">
          ${itemHoja("Origen del registro", reg.origen_registro)}
          ${itemHoja("Requiere ficha preanalítica", reg.requiere_ficha)}
          ${itemHoja("Cumplió indicaciones", reg.indicaciones_respuesta)}
          ${itemHoja("Detalle indicaciones", reg.indicaciones_detalle)}
          ${itemHoja("Motivo del análisis", reg.motivo_respuesta)}
          ${itemHoja("Detalle motivo", reg.motivo_detalle)}
          ${itemHoja("Enfermedad crónica", reg.enfermedad_cronica)}
          ${itemHoja("Enfermedades", listaTexto(reg.enfermedades))}
          ${itemHoja("Medicamentos", reg.medicamentos)}
          ${itemHoja("Detalle medicamentos", reg.medicamentos_detalle)}
          ${itemHoja("Detalles adicionales", listaTexto(reg.detalles_adicionales))}
          ${itemHoja("Otros detalles", reg.detalles_otros)}
        </div>
      </section>

      <section class="hoja-section">
        <h2>2. Datos de trazabilidad inicial</h2>
        <div class="hoja-grid">
          ${itemHoja("Hora de toma", reg.hora_centrifugacion)}
          ${itemHoja("Tipo de muestra", listaTexto(reg.tipos_muestra))}
          ${itemHoja("Recipientes", listaTexto(reg.recipientes))}
        </div>

        <h3>Centrifugación inicial</h3>
        ${tablaHoja(
          ["Recipiente", "Requiere centrifugación", "Hora"],
          centrifugacionInicial.map(item => [
            item.recipiente,
            item.requiere_centrifugacion,
            item.hora
          ])
        )}
      </section>

      <section class="hoja-section">
        <h2>3. Ingreso a control / centrifugación</h2>
        <div class="hoja-grid">
          ${itemHoja("Hora ingreso a control", reg.hora_ingreso_control)}
          ${itemHoja("Responsable ingreso", reg.responsable_ingreso)}
        </div>

        <h3>Amerita centrifugación</h3>
        ${tablaHoja(
          ["Recipiente", "¿Centrifuga?", "Ingreso", "Salida"],
          centrifugacionControl.map(item => [
            item.recipiente,
            item.centrifuga,
            item.ingreso,
            item.salida
          ])
        )}
      </section>

      <section class="hoja-section">
        <h2>4. Entrega al área</h2>
        <div class="hoja-grid">
          ${itemHoja("Responsable entrega general", reg.responsable_entrega)}
        </div>

        ${tablaHoja(
          ["Recipiente", "Área destino", "Hora entrega", "Responsable"],
          entregaArea.map(item => [
            item.recipiente,
            item.areas ? item.areas.join(", ") : item.area,
            item.hora,
            item.responsable || reg.responsable_entrega
          ])
        )}
      </section>

      <section class="hoja-section">
        <h2>5. Observaciones finales</h2>
        <div class="hoja-observaciones">
          ${limpiarHTML(reg.observaciones_finales || "Sin observaciones registradas.")}
        </div>
      </section>

      <footer class="hoja-footer">
        <div>
          <strong>Folio:</strong> ${limpiarHTML(reg.folio || "-")}
        </div>
        <div>
          Documento generado desde el sistema web de trazabilidad.
        </div>
      </footer>
    </article>
  `;
}

function itemHoja(titulo, valor) {
  return `
    <div class="hoja-item">
      <span>${limpiarHTML(titulo)}</span>
      <strong>${limpiarHTML(valor || "-")}</strong>
    </div>
  `;
}

function tablaHoja(headers, rows) {
  const filasValidas = rows.filter(row => row.some(valor => valor));

  if (filasValidas.length === 0) {
    return `<p class="hoja-vacio">Sin datos registrados.</p>`;
  }

  return `
    <div class="hoja-table-wrap">
      <table class="hoja-table">
        <thead>
          <tr>
            ${headers.map(header => `<th>${limpiarHTML(header)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${filasValidas.map(row => `
            <tr>
              ${row.map(valor => `<td>${limpiarHTML(valor || "-")}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function instalarEstilosHojaTrazabilidad() {
  if (document.getElementById("estilosHojaTrazabilidad")) return;

  const style = document.createElement("style");
  style.id = "estilosHojaTrazabilidad";
  style.textContent = `
    .hoja-modal-box{
      width:min(1200px,100%);
    }

    .hoja-loading{
      padding:24px;
      font-weight:700;
      color:#64748b;
    }

    .hoja-documento{
      background:#fff;
      border:1px solid #dbe3ef;
      border-radius:22px;
      padding:28px;
      color:#172033;
    }

    .hoja-header{
      display:flex;
      justify-content:space-between;
      gap:18px;
      align-items:flex-start;
      border-bottom:3px solid #2f6fed;
      padding-bottom:18px;
      margin-bottom:20px;
    }

    .hoja-header h1{
      margin:0;
      font-size:28px;
      letter-spacing:-.5px;
    }

    .hoja-header p{
      margin:8px 0 0;
      color:#64748b;
    }

    .hoja-estado{
      padding:10px 16px;
      border-radius:999px;
      font-weight:800;
      white-space:nowrap;
      background:#f1f5f9;
      color:#334155;
    }

    .hoja-estado.open{
      background:#e8f8ef;
      color:#17804b;
    }

    .hoja-estado.process{
      background:#fff7db;
      color:#9a6400;
    }

    .hoja-estado.closed{
      background:#e8eef8;
      color:#334155;
    }

    .hoja-estado.cancelled{
      background:#ffe5e5;
      color:#b10000;
    }

    .hoja-resumen{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
      gap:12px;
      margin-bottom:20px;
    }

    .hoja-resumen div,
    .hoja-item{
      border:1px solid #dbe3ef;
      background:#f8fbff;
      border-radius:14px;
      padding:12px;
    }

    .hoja-resumen span,
    .hoja-item span{
      display:block;
      font-size:12px;
      text-transform:uppercase;
      color:#64748b;
      font-weight:800;
      letter-spacing:.4px;
      margin-bottom:5px;
    }

    .hoja-resumen strong,
    .hoja-item strong{
      font-size:15px;
      color:#172033;
      word-break:break-word;
    }

    .hoja-section{
      border:1px solid #dbe3ef;
      border-radius:18px;
      padding:18px;
      margin-top:16px;
      page-break-inside:avoid;
    }

    .hoja-section h2{
      margin:0 0 14px;
      color:#214ccf;
      font-size:20px;
    }

    .hoja-section h3{
      margin:18px 0 10px;
      font-size:16px;
      color:#334155;
    }

    .hoja-grid{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
      gap:10px;
    }

    .hoja-table-wrap{
      overflow:auto;
      border:1px solid #dbe3ef;
      border-radius:14px;
    }

    .hoja-table{
      width:100%;
      border-collapse:collapse;
      min-width:650px;
    }

    .hoja-table th{
      background:#eef3fb;
      color:#334155;
      text-align:left;
      padding:10px;
      font-size:13px;
    }

    .hoja-table td{
      padding:10px;
      border-top:1px solid #e5edf7;
      font-size:14px;
    }

    .hoja-vacio{
      background:#f8fafc;
      border:1px dashed #cbd5e1;
      border-radius:14px;
      padding:12px;
      color:#64748b;
      font-weight:700;
    }

    .hoja-observaciones{
      background:#f8fafc;
      border:1px solid #dbe3ef;
      border-radius:14px;
      padding:14px;
      min-height:70px;
      white-space:pre-wrap;
    }

    .hoja-footer{
      display:flex;
      justify-content:space-between;
      gap:12px;
      border-top:1px solid #dbe3ef;
      margin-top:20px;
      padding-top:14px;
      color:#64748b;
      font-size:13px;
    }

    @media(max-width:768px){
      .hoja-header,
      .hoja-footer{
        flex-direction:column;
      }

      .hoja-documento{
        padding:18px;
      }
    }

    @media print{
      body *{
        visibility:hidden !important;
      }

      #modalHojaTrazabilidad,
      #modalHojaTrazabilidad *{
        visibility:visible !important;
      }

      #modalHojaTrazabilidad{
        position:absolute !important;
        inset:0 !important;
        background:#fff !important;
      }

      #modalHojaTrazabilidad .modal-bg{
        position:static !important;
        background:#fff !important;
        padding:0 !important;
        display:block !important;
      }

      #modalHojaTrazabilidad .modal-box{
        width:100% !important;
        max-height:none !important;
        overflow:visible !important;
        box-shadow:none !important;
        border-radius:0 !important;
        padding:0 !important;
      }

      .no-print{
        display:none !important;
      }

      .hoja-documento{
        border:none !important;
        border-radius:0 !important;
        padding:0 !important;
        box-shadow:none !important;
      }

      .hoja-section{
        page-break-inside:avoid;
      }

      .hoja-table{
        min-width:0 !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function claseEstado(estado) {
  const limpio = (estado || "").toUpperCase();

  if (limpio === "CERRADO") return "closed";
  if (limpio === "EN PROCESO") return "process";
  if (limpio === "ABIERTO") return "open";
  if (limpio === "ANULADO") return "cancelled";

  return "unknown";
}

function formatearFecha(valor) {
  if (!valor) return "-";

  try {
    return new Date(valor).toLocaleString("es-PE");
  } catch (error) {
    return valor;
  }
}

function formatearFechaCorta(valor) {
  if (!valor) return "-";

  try {
    return new Date(valor).toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (error) {
    return valor;
  }
}

function listaTexto(valor) {
  if (!valor) return "-";

  if (Array.isArray(valor)) {
    return valor.length ? valor.join(", ") : "-";
  }

  if (typeof valor === "object") {
    return JSON.stringify(valor);
  }

  return valor;
}

function limpiarHTML(valor) {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function limpiarAtributo(valor) {
  return limpiarHTML(valor).replaceAll("`", "&#096;");
}
