const SUPABASE_URL = "https://kqbetryygymtsyhsowxj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QRC-82FH-YC2znJDSicb3Q_u82tcaHP";

let supabaseClient;

window.addEventListener("DOMContentLoaded", () => {
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    alert("Error conectando Supabase: " + err.message);
    return;
  }

  document.querySelectorAll(".menu-card").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.getElementById("btnIrRegistrar").addEventListener("click", () => showView("registrar"));
  document.getElementById("btnIrBuscar").addEventListener("click", () => showView("buscar"));
  document.getElementById("btnBuscar").addEventListener("click", buscarRegistro);
  document.getElementById("formRegistro").addEventListener("submit", guardarRegistro);
});

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".menu-card").forEach(b => b.classList.remove("active"));
  document.getElementById(viewId).classList.add("active");
  const btn = document.querySelector(`[data-view="${viewId}"]`);
  if (btn) btn.classList.add("active");
}

async function guardarRegistro(e) {
  e.preventDefault();
  e.stopPropagation();

  const mensaje = document.getElementById("mensajeRegistro");
  mensaje.textContent = "Guardando...";
  mensaje.style.color = "#172033";

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  Object.keys(data).forEach(key => {
    if (data[key] === "") data[key] = null;
  });

  try {
    const { error } = await supabaseClient.from("trazabilidad").insert([data]);
    if (error) throw error;
    mensaje.textContent = "Registro guardado correctamente.";
    mensaje.style.color = "green";
    e.target.reset();
  } catch (err) {
    mensaje.textContent = "Error al guardar: " + err.message;
    mensaje.style.color = "crimson";
  }

  return false;
}

async function buscarRegistro() {
  const folio = document.getElementById("buscarFolio").value.trim();
  const contenedor = document.getElementById("resultadoBusqueda");

  if (!folio) {
    contenedor.innerHTML = "<p>Escribe un folio para buscar.</p>";
    return;
  }

  contenedor.innerHTML = "<p>Buscando...</p>";

  try {
    const { data, error } = await supabaseClient
      .from("trazabilidad")
      .select("*")
      .ilike("folio", `%${folio}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      contenedor.innerHTML = "<p>No se encontraron registros.</p>";
      return;
    }

    contenedor.innerHTML = data.map(reg => `
      <div class="result-card">
        <h3>Folio: ${reg.folio || ""}</h3>
        <p><b>Responsable:</b> ${reg.responsable || ""}</p>
        <p><b>Tipo de muestra:</b> ${reg.tipo_muestra || ""}</p>
        <p><b>Recipiente:</b> ${reg.tipo_recipiente || ""}</p>
        <p><b>Centrifugada:</b> ${reg.centrifugada || ""}</p>
        <p><b>Sede:</b> ${reg.sede || ""}</p>
        <p><b>Estado:</b> ${reg.estado || ""}</p>
        <p><b>Observaciones:</b> ${reg.observaciones || ""}</p>
        <p><b>Creado:</b> ${reg.created_at ? new Date(reg.created_at).toLocaleString() : ""}</p>
      </div>
    `).join("");
  } catch (err) {
    contenedor.innerHTML = `<div class="errorbox">Error al buscar: ${err.message}</div>`;
  }
}
