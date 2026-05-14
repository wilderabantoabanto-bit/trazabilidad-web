const SUPABASE_URL = "https://kqbetryygymtsyhsowxj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QRC-82FH-YC2znJDSicb3Q_u82tcaHP";

let supabaseClient;

const selected = {
  enfermedades: [],
  detalles_adicionales: [],
  tipos_muestra: [],
  recipientes: []
};

window.addEventListener("DOMContentLoaded", () => {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  document.querySelectorAll("[data-chip]").forEach(btn => {
    btn.addEventListener("click", () => toggleChip(btn));
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

  actualizarOcultos();

  if (grupo === "recipientes") {
    renderCentrifugacion();
  }
}

function actualizarOcultos() {
  document.getElementById("tipos_muestra").value = JSON.stringify(selected.tipos_muestra);
  document.getElementById("recipientes").value = JSON.stringify(selected.recipientes);
  document.getElementById("enfermedades").value = JSON.stringify(selected.enfermedades);
  document.getElementById("detalles_adicionales").value = JSON.stringify(selected.detalles_adicionales);
}

function renderCentrifugacion() {
  const box = document.getElementById("tablaCentrifugacion");

  if (selected.recipientes.length === 0) {
    box.innerHTML = "Selecciona recipientes arriba para generar la tabla.";
    return;
  }

  box.innerHTML = `
    <table class="mini-table">
      <thead>
        <tr>
          <th>Recipiente</th>
          <th>¿Centrifuga?</th>
          <th>Hora</th>
          <th>Observación</th>
        </tr>
      </thead>
      <tbody>
        ${selected.recipientes.map((rec, index) => `
          <tr>
            <td>${rec}</td>
            <td>
              <select data-centri="${index}" data-field="centrifuga">
                <option value="">--</option>
                <option>SI</option>
                <option>NO</option>
                <option>NO APLICA</option>
              </select>
            </td>
            <td>
              <input type="time" data-centri="${index}" data-field="hora" />
            </td>
            <td>
              <input placeholder="Obs." data-centri="${index}" data-field="observacion" />
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function obtenerCentrifugacion() {
  return selected.recipientes.map((rec, index) => {
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

  data.tipos_muestra = selected.tipos_muestra;
  data.recipientes = selected.recipientes;
  data.enfermedades = selected.enfermedades;
  data.detalles_adicionales = selected.detalles_adicionales;
  data.centrifugacion = obtenerCentrifugacion();

  data.estado = "ABIERTO";

  Object.keys(data).forEach(key => {
    if (data[key] === "") data[key] = null;
  });

  const { error } = await supabaseClient
    .from("trazabilidad")
    .insert([data]);

  if (error) {
    mensaje.textContent = "Error al guardar: " + error.message;
    mensaje.style.color = "crimson";
    return;
  }

  mensaje.textContent = "Registro guardado correctamente.";
  mensaje.style.color = "green";
  limpiarFormulario();
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
      <p><b>Observaciones:</b> ${reg.observaciones || ""}</p>
      <p><b>Creado:</b> ${reg.created_at ? new Date(reg.created_at).toLocaleString() : ""}</p>
    </div>
  `).join("");
}