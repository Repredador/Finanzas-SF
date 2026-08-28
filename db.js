import { app, auth } from './auth.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const db = getFirestore(app);

// Referencias del DOM principales
const tablaDeudas = document.getElementById('tabla-deudas');
const statTotal = document.getElementById('stat-total');
const statMensual = document.getElementById('stat-mensual');
const statActivas = document.getElementById('stat-activas');

// Referencias del Modal
const modalNuevaDeuda = document.getElementById('modal-nueva-deuda');
const btnNuevaDeuda = document.getElementById('btn-nueva-deuda');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const formNuevaDeuda = document.getElementById('form-nueva-deuda');
const btnGuardarDeuda = document.getElementById('btn-guardar-deuda');

// Helpers de formateo
const formatMoney = (amount) => {
    if (isNaN(amount)) return '$0';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
};

// Lógica dinámica para calcular estado y cuota actual
const calcularEstadoYCuota = (fechaPrimera, numCuotas) => {
    if (!fechaPrimera || numCuotas === 0 || isNaN(numCuotas)) {
        return { cuota: 'FINALIZADA', estado: 'Finalizada', colorClass: 'text-secondary bg-secondary/10 border-secondary/20' };
    }
    
    const hoy = new Date();
    const [año, mes, dia] = fechaPrimera.split('-');
    const fechaInicio = new Date(año, mes - 1, dia);
    
    let mesesPasados = (hoy.getFullYear() - fechaInicio.getFullYear()) * 12 + (hoy.getMonth() - fechaInicio.getMonth());
    let cuotaActual = mesesPasados + 1;

    if (cuotaActual <= 0) {
        return { cuota: 0, estado: 'Próxima', colorClass: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' };
    } else if (cuotaActual > numCuotas) {
        return { cuota: 'FINALIZADA', estado: 'Finalizada', colorClass: 'text-secondary bg-secondary/10 border-secondary/20' };
    } else {
        return { cuota: `${cuotaActual} / ${numCuotas}`, estado: 'Al Día', colorClass: 'text-primary bg-primary/10 border-primary/20' };
    }
};

// Cargar y mostrar datos
const cargarDeudas = async (userId) => {
    tablaDeudas.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">Cargando deudas...</td></tr>`;
    
    try {
        const q = query(collection(db, "deudas"), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        
        let deudasHtml = '';
        let sumaTotal = 0;
        let sumaMensualEstimada = 0;
        let activasCount = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            const monto = data.montoTotal || 0;
            const cuotas = data.numeroCuotas || 0;
            const calculo = calcularEstadoYCuota(data.fechaPrimeraCuota, cuotas);
            
            // Calculo de totales (ignorar si está finalizada)
            if (calculo.estado !== 'Finalizada') {
                sumaTotal += monto;
                activasCount++;
                if (cuotas > 0) {
                    sumaMensualEstimada += (monto / cuotas);
                }
            }

            deudasHtml += `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="p-4 font-medium text-slate-300">${data.origen || '-'}</td>
                    <td class="p-4">${data.nombre || '-'}</td>
                    <td class="p-4 text-right font-medium">${formatMoney(monto)}</td>
                    <td class="p-4 text-center text-slate-300 font-mono">${calculo.cuota}</td>
                    <td class="p-4 text-center">
                        <span class="px-3 py-1 rounded-full text-xs border ${calculo.colorClass}">
                            ${calculo.estado}
                        </span>
                    </td>
                </tr>
            `;
        });

        if (querySnapshot.empty) {
            tablaDeudas.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">No tienes deudas registradas. ¡Agrega una nueva!</td></tr>`;
        } else {
            tablaDeudas.innerHTML = deudasHtml;
        }

        statTotal.textContent = formatMoney(sumaTotal);
        statMensual.textContent = formatMoney(sumaMensualEstimada);
        statActivas.textContent = activasCount.toString();

    } catch (error) {
        console.error("Error al obtener deudas:", error);
        tablaDeudas.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">Error al cargar datos. Revisa la consola.</td></tr>`;
    }
};

// --- Lógica del Modal y Formulario ---

const abrirModal = () => modalNuevaDeuda.classList.remove('hidden-view');
const cerrarModal = () => {
    modalNuevaDeuda.classList.add('hidden-view');
    formNuevaDeuda.reset(); // Limpiar formulario al cerrar
};

btnNuevaDeuda.addEventListener('click', abrirModal);
btnCerrarModal.addEventListener('click', cerrarModal);
btnCancelarModal.addEventListener('click', cerrarModal);
document.getElementById('modal-overlay').addEventListener('click', cerrarModal); // Cerrar al clickear el fondo

formNuevaDeuda.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("Debes estar logueado para hacer esto.");

    // Cambiar estado del botón
    const btnSpan = btnGuardarDeuda.querySelector('span');
    btnSpan.textContent = 'Guardando...';
    btnGuardarDeuda.disabled = true;

    // Obtener valores
    const origen = document.getElementById('input-origen').value.trim();
    const nombre = document.getElementById('input-nombre').value.trim();
    const montoTotal = parseFloat(document.getElementById('input-monto').value);
    const numeroCuotas = parseInt(document.getElementById('input-cuotas').value, 10);
    const fechaPrimeraCuota = document.getElementById('input-fecha').value;

    try {
        await addDoc(collection(db, "deudas"), {
            origen,
            nombre,
            montoTotal,
            numeroCuotas,
            fechaPrimeraCuota,
            userId: user.uid,
            fechaCreacion: new Date()
        });
        
        cerrarModal();
        cargarDeudas(user.uid); // Recargar la tabla
    } catch (error) {
        console.error("Error agregando documento: ", error);
        alert("Ocurrió un error al guardar la deuda.");
    } finally {
        btnSpan.textContent = 'Guardar Deuda';
        btnGuardarDeuda.disabled = false;
    }
});

// Escuchar cambios de sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        cargarDeudas(user.uid);
    }
});
