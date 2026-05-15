const SUPABASE_URL = "https://kqbetryygymtsyhsowxj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QRC-82FH-YC2znJDSicb3Q_u82tcaHP";

const TIEMPO_AUTOGUARDADO_MS = 1200;
const MIN_FOLIO_AUTOGUARDADO = 6;
const MINUTOS_CENTRIFUGACION = 10;

let supabaseClient;
let registroActual = null;
let folioActual = "";
let ultimoGuardado = null;
let autosaveTimerRegistro = null;
let autosaveTimerAvance = null;
let hashUltimoRegistroGuardado = "";
let guardadoFinalEnProceso = false;
let avanceEnProceso = false;

const selected = {
  enfermedades: [],
  detalles_adicionales: [],
  tipos_muestra: [],
  recipientes: []
};

window.addEventListener("DOMContentLoaded", () => {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  crearModalContinuar();

  document.querySelectorAll(".menu-card").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.getElementById("btnIrRegistrar").addEventListener("click", () => showView("registrar"));
  document.getElementById("btnIrBuscar").addEventListener("click", () => showView("buscar"));
  document.getElementById("btnBuscar").addEventListener("click", buscarRegistro);
  document.getElementById("btnLimpiar").addEventListener("click", limpiarFormulario);
  document.getElementById("formRegistro").addEventListener("submit", guardarRegistro);

  const formRegistro = document.getElementById("formRegistro");
  formRegistro.addEventListener("input", programarAutoGuardadoRegistro);
  formRegistro.addEventListener("change", programarAutoGuardadoRegistro);

  document.getElementById("requiereFicha").addEventListener("change", manejarFicha);
  document.getElementById("enfermedadCronica").addEventListener("change", manejarEnfermedad);
  document.getElementById("origenRegistro").addEventListener("change", manejarOrigen);

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

  actualizarPanelFolio();
});

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".menu-card").forEach(b => b.classList.remove("active"));

  document.getElementById(viewId).classList.add("active");

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
  const valor = document.getElementById("requiereFicha").value;
  document.getElementById("bloquePreanalitica").classList.toggle("hidden", valor !== "SI");
}

function manejarEnfermedad() {
  const valor = document.getElementById("enfermedadCronica").value;
  document.getElementById("chipsEnfermedades").classList.toggle("hidden", valor !== "SI");
}

function manejarOrigen() {
  const valor = document.getElementById("origenRegistro").value;
  document.getElementById("origenOtrosBox").classList.toggle("hidden", valor !== "OTROS");
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
  document.getElementById("enfermedadOtrosBox").classList.toggle("hidden", !selected.enfermedades.includes("Otros"));
  document.getElementById("detallesOtrosBox").classList.toggle("hidden", !selected.detalles_adicionales.includes("Otros"));
  document.getElementById("muestraOtrosBox").classList.toggle("hidden", !selected.tipos_muestra.includes("Otros"));
  document.getElementById("recipienteOtrosBox").classList.toggle("hidden", !selected.recipientes.includes("Otros"));

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
  document.getElementById("tipos_muestra").value = JSON.stringify(getTiposMuestraFinales());
  document.getElementById("recipientes").value = JSON.stringify(getRecipientesFinales());
  document.getElementById("enfermedades").value = JSON.stringify(selected.enfermedades);
  document.getElementById("detalles_adicionales").value = JSON.stringify(selected.detalles_adicionales);
}

function renderCentrifugacion() {
  const box = document.getElementById("tablaCentrifugacion");
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
        <button type="button" class="secondary" onclick="limpiarFormulario()">Nuevo registro</button>
      </div>
    </div>
  `;
  mensaje.style.color = "green";
}

function limpiarFormulario() {
  clearTimeout(autosaveTimerRegistro);
  document.getElementById("formRegistro").reset();

  selected.enfermedades = [];
  selected.detalles_adicionales = [];
  selected.tipos_muestra = [];
  selected.recipientes = [];

  folioActual = "";
  ultimoGuardado = null;
  hashUltimoRegistroGuardado = "";

  document.querySelectorAll(".chips button").forEach(btn => btn.classList.remove("selected"));

  document.getElementById("bloquePreanalitica").classList.add("hidden");
  document.getElementById("chipsEnfermedades").classList.add("hidden");
  document.getElementById("origenOtrosBox").classList.add("hidden");
  document.getElementById("enfermedadOtrosBox").classList.add("hidden");
  document.getElementById("detallesOtrosBox").classList.add("hidden");
  document.getElementById("muestraOtrosBox").classList.add("hidden");
  document.getElementById("recipienteOtrosBox").classList.add("hidden");

  actualizarOcultos();
  renderCentrifugacion();
  actualizarPanelFolio("Registro inicial");

  document.getElementById("mensajeRegistro").textContent = "Sin guardar";
  document.getElementById("mensajeRegistro").style.color = "#64748b";
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
        <p><b>Muestras:</b> ${limpiarHTML((reg.tipos_muestra || []).join(", "))}</p>
        <p><b>Recipientes:</b> ${limpiarHTML((reg.recipientes || []).join(", "))}</p>
        <p><b>Creado:</b> ${reg.created_at ? new Date(reg.created_at).toLocaleString("es-PE") : ""}</p>
        <p><b>Última actualización:</b> ${reg.updated_at ? new Date(reg.updated_at).toLocaleString("es-PE") : ""}</p>
      </div>

      <div class="hero-actions">
        <button type="button" onclick="copiarFolio('${limpiarAtributo(reg.folio || "")}')">Copiar folio</button>
        <button type="button" onclick="abrirContinuarPorFolio('${limpiarAtributo(reg.folio || "")}')">Continuar trazabilidad</button>
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

          <label>Responsable entrega
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
          <button type="button" class="danger-btn" onclick="cerrarFolio()">Cerrar folio</button>
        </div>
      </div>
    </div>
  `;

  modal.addEventListener("input", evento => {
    if (evento.target.matches("input, select, textarea")) {
      programarAutoGuardadoAvance();
    }
  });

  modal.addEventListener("change", evento => {
    if (evento.target.matches("input, select, textarea")) {
      programarAutoGuardadoAvance();
    }
  });

  document.body.appendChild(modal);
}

function cargarModalContinuar(reg) {
  clearTimeout(autosaveTimerAvance);

  document.getElementById("modalContinuar").classList.remove("hidden");
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
  document.getElementById("modalContinuar").classList.add("hidden");
}

function renderTablaControl(reg) {
  const recipientes = reg.recipientes || [];
  const guardado = reg.centrifugacion_control || [];
  const box = document.getElementById("tablaControl");

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
  const box = document.getElementById("tablaEntrega");

  if (recipientes.length === 0) {
    box.innerHTML = "Este folio no tiene recipientes registrados.";
    return;
  }

  box.innerHTML = `
    <table class="mini-table">
      <thead>
        <tr>
          <th>Recipiente</th>
          <th>Área destino</th>
          <th>Hora entrega</th>
        </tr>
      </thead>
      <tbody>
        ${recipientes.map((rec, index) => {
          const item = guardado.find(x => x.recipiente === rec) || {};
          return `
            <tr>
              <td>${limpiarHTML(rec)}</td>
              <td>
                <select data-entrega="${index}" data-field="area">
                  <option value="">-- Selecciona --</option>
                  <option ${item.area === "BIOQUÍMICA" ? "selected" : ""}>BIOQUÍMICA</option>
                  <option ${item.area === "HEMATOLOGÍA" ? "selected" : ""}>HEMATOLOGÍA</option>
                  <option ${item.area === "COAGULOMETRÍA" ? "selected" : ""}>COAGULOMETRÍA</option>
                  <option ${item.area === "INMUNOLOGÍA" ? "selected" : ""}>INMUNOLOGÍA</option>
                  <option ${item.area === "MICROBIOLOGÍA" ? "selected" : ""}>MICROBIOLOGÍA</option>
                </select>
              </td>
              <td><input type="time" data-entrega="${index}" data-field="hora" value="${limpiarAtributo(item.hora || "")}" /></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function obtenerControl() {
  const recipientes = registroActual.recipientes || [];

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
  const recipientes = registroActual.recipientes || [];

  return recipientes.map((rec, index) => {
    const campos = document.querySelectorAll(`[data-entrega="${index}"]`);
    const item = { recipiente: rec };

    campos.forEach(campo => {
      item[campo.dataset.field] = campo.value || null;
    });

    return item;
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

  const payload = {
    hora_ingreso_control: document.getElementById("horaIngresoControl").value || null,
    responsable_ingreso: document.getElementById("responsableIngreso").value || null,
    responsable_entrega: document.getElementById("responsableEntrega").value || null,
    centrifugacion_control: obtenerControl(),
    entrega_area: obtenerEntrega(),
    observaciones_finales: document.getElementById("observacionesFinales").value || null,
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
}

function claseEstado(estado) {
  const limpio = (estado || "").toUpperCase();

  if (limpio === "CERRADO") return "closed";
  if (limpio === "EN PROCESO") return "process";
  if (limpio === "ABIERTO") return "open";

  return "unknown";
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