const SUPABASE_URL = "https://kqbetryygymtsyhsowxj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QRC-82FH-YC2znJDSicb3Q_u82tcaHP";

let supabaseClient;
let registroActual = null;

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

  document.getElementById("requiereFicha").addEventListener("change", manejarFicha);
  document.getElementById("enfermedadCronica").addEventListener("change", manejarEnfermedad);
  document.getElementById("origenRegistro").addEventListener("change", manejarOrigen);

  document.querySelectorAll("[data-chip]").forEach(btn => {
    btn.addEventListener("click", () => toggleChip(btn));
  });

  document.querySelector('[name="tipo_muestra_otros"]')?.addEventListener("input", () => {
    actualizarOcultos();
  });

  document.querySelector('[name="recipiente_otros"]')?.addEventListener("input", () => {
    actualizarOcultos();
    renderCentrifugacion();
  });
});

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".menu-card").forEach(b => b.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");

  const btn = document.querySelector(`[data-view="${viewId}"]`);
  if (btn) btn.classList.add("active");
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
            <td>${rec}</td>
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

async function guardarRegistro(e) {
  e.preventDefault();

  const mensaje = document.getElementById("mensajeRegistro");
  mensaje.textContent = "Guardando...";
  mensaje.style.color = "#172033";

  actualizarOcultos();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  const origenOtros = valorInput("origen_otros");
  const enfermedadOtros = valorInput("enfermedad_otros");

  if (data.origen_registro === "OTROS" && origenOtros) {
    data.origen_registro = "OTROS: " + origenOtros;
  }

  data.tipos_muestra = getTiposMuestraFinales();
  data.recipientes = getRecipientesFinales();
  data.enfermedades = [...selected.enfermedades];
  data.detalles_adicionales = [...selected.detalles_adicionales];

  if (enfermedadOtros) {
    data.enfermedades = data.enfermedades.filter(x => x !== "Otros");
    data.enfermedades.push(enfermedadOtros);
  }

  data.centrifugacion = obtenerCentrifugacion();
  data.estado = "ABIERTO";
  data.updated_at = new Date().toISOString();

  delete data.origen_otros;
  delete data.enfermedad_otros;
  delete data.tipo_muestra_otros;
  delete data.recipiente_otros;

  Object.keys(data).forEach(key => {
    if (data[key] === "") data[key] = null;
  });

  const { error } = await supabaseClient
    .from("trazabilidad")
    .upsert([data], { onConflict: "folio" });

  if (error) {
    mensaje.textContent = "Error al guardar: " + error.message;
    mensaje.style.color = "crimson";
    return;
  }

  mensaje.innerHTML = `
    Registro guardado correctamente.
    <br>
    <button type="button" onclick="copiarFolio('${data.folio}')">Copiar folio</button>
    <button type="button" onclick="abrirContinuarPorFolio('${data.folio}')">Continuar trazabilidad</button>
  `;
  mensaje.style.color = "green";
}

function limpiarFormulario() {
  document.getElementById("formRegistro").reset();

  selected.enfermedades = [];
  selected.detalles_adicionales = [];
  selected.tipos_muestra = [];
  selected.recipientes = [];

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
    contenedor.innerHTML = `<div class="errorbox">Error al buscar: ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron registros.</p>";
    return;
  }

  contenedor.innerHTML = data.map(reg => `
    <div class="result-card">
      <h3>Folio: ${reg.folio || ""}</h3>
      <p><b>Origen:</b> ${reg.origen_registro || ""}</p>
      <p><b>Requiere ficha:</b> ${reg.requiere_ficha || ""}</p>
      <p><b>Responsable:</b> ${reg.responsable || ""}</p>
      <p><b>Sede:</b> ${reg.sede || ""}</p>
      <p><b>Muestras:</b> ${(reg.tipos_muestra || []).join(", ")}</p>
      <p><b>Recipientes:</b> ${(reg.recipientes || []).join(", ")}</p>
      <p><b>Estado:</b> ${reg.estado || ""}</p>
      <p><b>Creado:</b> ${reg.created_at ? new Date(reg.created_at).toLocaleString() : ""}</p>

      <div class="hero-actions">
        <button type="button" onclick="copiarFolio('${reg.folio}')">Copiar folio</button>
        <button type="button" onclick="abrirContinuarPorFolio('${reg.folio}')">Continuar trazabilidad</button>
      </div>
    </div>
  `).join("");
}

async function copiarFolio(folio) {
  await navigator.clipboard.writeText(folio);
  alert("Folio copiado: " + folio);
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

        <div class="actions">
          <button type="button" class="secondary" onclick="cerrarModalContinuar()">Cerrar ventana</button>
          <button type="button" onclick="guardarAvance()">Guardar avance</button>
          <button type="button" class="danger-btn" onclick="cerrarFolio()">Cerrar folio</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function cargarModalContinuar(reg) {
  document.getElementById("modalContinuar").classList.remove("hidden");
  document.getElementById("continuarPill").textContent = "Continuar • Folio: " + reg.folio;

  document.getElementById("horaIngresoControl").value = reg.hora_ingreso_control || "";
  document.getElementById("responsableIngreso").value = reg.responsable_ingreso || "";
  document.getElementById("responsableEntrega").value = reg.responsable_entrega || "";
  document.getElementById("observacionesFinales").value = reg.observaciones_finales || "";

  renderTablaControl(reg);
  renderTablaEntrega(reg);
}

function cerrarModalContinuar() {
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
          <th>Salida</th>
        </tr>
      </thead>
      <tbody>
        ${recipientes.map((rec, index) => {
          const item = guardado.find(x => x.recipiente === rec) || {};
          return `
            <tr>
              <td>${rec}</td>
              <td>
                <select data-control="${index}" data-field="centrifuga">
                  <option value="">--</option>
                  <option ${item.centrifuga === "SI" ? "selected" : ""}>SI</option>
                  <option ${item.centrifuga === "NO" ? "selected" : ""}>NO</option>
                  <option ${item.centrifuga === "NO APLICA" ? "selected" : ""}>NO APLICA</option>
                </select>
              </td>
              <td><input type="time" data-control="${index}" data-field="ingreso" value="${item.ingreso || ""}" /></td>
              <td><input type="time" data-control="${index}" data-field="salida" value="${item.salida || ""}" /></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
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
              <td>${rec}</td>
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
              <td><input type="time" data-entrega="${index}" data-field="hora" value="${item.hora || ""}" /></td>
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

async function guardarAvance() {
  if (!registroActual) return;

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

  if (error) {
    document.getElementById("mensajeContinuar").textContent = "Error al guardar avance: " + error.message;
    document.getElementById("mensajeContinuar").style.color = "crimson";
    return;
  }

  document.getElementById("mensajeContinuar").textContent = "Avance guardado correctamente.";
  document.getElementById("mensajeContinuar").style.color = "green";
}

async function cerrarFolio() {
  if (!registroActual) return;

  await guardarAvance();

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

  alert("Folio cerrado correctamente.");
  cerrarModalContinuar();
}