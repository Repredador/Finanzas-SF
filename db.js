import { app, auth } from './auth.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where,
    deleteDoc,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const db = getFirestore(app);

// Referencias del DOM
const tablaDeudas = document.getElementById('tabla-deudas');
const statTotal = document.getElementById('stat-total');
const statMensual = document.getElementById('stat-mensual');
const statActivas = document.getElementById('stat-activas');
const modalNuevaDeuda = document.getElementById('modal-nueva-deuda');
const btnNuevaDeuda = document.getElementById('btn-nueva-deuda');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const formNuevaDeuda = document.getElementById('form-nueva-deuda');
const btnGuardarDeuda = document.getElementById('btn-guardar-deuda');
const modalTitulo = document.getElementById('modal-titulo');

// Estado Global (Filtros PBI)
let allDeudas = [];
let filtroEstado = 'Todas';
let filtroOrigen = 'Todos';
let chartOrigenInstance = null;
let chartEstadoInstance = null;

// Helpers
const formatMoney = (amount) => {
    if (isNaN(amount)) return '$0';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
};

Chart.defaults.color = '#94A3B8';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

const calcularEstadoYCuota = (fechaPrimera, numCuotas) => {
    if (!fechaPrimera || numCuotas === 0 || isNaN(numCuotas)) {
        return { cuota: 'FINALIZADA', estado: 'Finalizada', colorClass: 'text-secondary bg-secondary/10 border-secondary/20' };
    }
    const hoy = new Date();
    const [año, mes, dia] = fechaPrimera.split('-');
    const fechaInicio = new Date(año, mes - 1, dia);
    let mesesPasados = (hoy.getFullYear() - fechaInicio.getFullYear()) * 12 + (hoy.getMonth() - fechaInicio.getMonth());
    let cuotaActual = mesesPasados + 1;

    if (cuotaActual <= 0) return { cuota: 0, estado: 'Próxima', colorClass: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' };
    if (cuotaActual > numCuotas) return { cuota: 'FINALIZADA', estado: 'Finalizada', colorClass: 'text-secondary bg-secondary/10 border-secondary/20' };
    return { cuota: `${cuotaActual} / ${numCuotas}`, estado: 'Al Día', colorClass: 'text-primary bg-primary/10 border-primary/20' };
};

const fetchDeudas = async (userId) => {
    tablaDeudas.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Cargando deudas...</td></tr>`;
    try {
        const q = query(collection(db, "deudas"), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        
        allDeudas = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const calculo = calcularEstadoYCuota(data.fechaPrimeraCuota, data.numeroCuotas);
            allDeudas.push({ id: doc.id, ...data, calculo });
        });
        
        renderUI();
    } catch (error) {
        console.error("Error al obtener:", error);
        tablaDeudas.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-400">Error al cargar datos.</td></tr>`;
    }
};

const renderUI = () => {
    let deudasHtml = '';
    let sumaTotal = 0, sumaMensualEstimada = 0, activasCount = 0;
    const conteoOrigenes = {};
    const conteoEstados = { 'Al Día': 0, 'Próxima': 0, 'Finalizada': 0 };

    // Filtros Cruzados (Power BI style)
    const deudasFiltradas = allDeudas.filter(data => {
        const passEstado = filtroEstado === 'Todas' || data.calculo.estado === filtroEstado;
        const passOrigen = filtroOrigen === 'Todos' || (data.origen || 'Otro') === filtroOrigen;
        
        // Datos para gráfico de Origen (ignora filtroOrigen para poder mostrar la distribución total del estado)
        if (passEstado) {
            const org = data.origen || 'Otro';
            conteoOrigenes[org] = (conteoOrigenes[org] || 0) + 1;
        }

        // Datos para gráfico de Estado (ignora filtroEstado para poder mostrar todos los estados de un origen)
        if (passOrigen) {
            conteoEstados[data.calculo.estado]++;
        }

        return passEstado && passOrigen;
    });

    deudasFiltradas.forEach(data => {
        const monto = data.montoTotal || 0;
        const cuotas = data.numeroCuotas || 0;
        const calculo = data.calculo;

        if (calculo.estado !== 'Finalizada') {
            sumaTotal += monto;
            activasCount++;
            if (cuotas > 0) sumaMensualEstimada += (monto / cuotas);
        }

        deudasHtml += `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="p-4 font-medium text-slate-300">${data.origen || '-'}</td>
                <td class="p-4">${data.nombre || '-'}</td>
                <td class="p-4 text-right font-medium">${formatMoney(monto)}</td>
                <td class="p-4 text-center text-slate-300 font-mono">${calculo.cuota}</td>
                <td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-xs border ${calculo.colorClass}">${calculo.estado}</span></td>
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <button data-id="${data.id}" class="btn-editar text-blue-400 hover:text-blue-300 p-1" title="Editar">
                            <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button data-id="${data.id}" class="btn-eliminar text-red-400 hover:text-red-300 p-1" title="Eliminar">
                            <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tablaDeudas.innerHTML = deudasFiltradas.length ? deudasHtml : `<tr><td colspan="6" class="p-8 text-center text-slate-400">No hay deudas que coincidan con el filtro.</td></tr>`;
    statTotal.textContent = formatMoney(sumaTotal);
    statMensual.textContent = formatMoney(sumaMensualEstimada);
    statActivas.textContent = activasCount.toString();

    actualizarGraficos(conteoOrigenes, conteoEstados);
};

// --- Gráficos (Chart.js PBI Style) ---
const paletaOrigenes = ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#ef4444', '#14b8a6'];

const actualizarGraficos = (conteoOrigenes, conteoEstados) => {
    const ctxOrigen = document.getElementById('chartOrigen').getContext('2d');
    const ctxEstado = document.getElementById('chartEstado').getContext('2d');

    const origenesLabels = Object.keys(conteoOrigenes);
    const origenesData = Object.values(conteoOrigenes);
    const origenesColors = origenesLabels.map((l, i) => {
        // Atenuar los que no están seleccionados
        return (filtroOrigen === 'Todos' || filtroOrigen === l) ? paletaOrigenes[i % paletaOrigenes.length] : 'rgba(255,255,255,0.1)';
    });

    if (chartOrigenInstance) chartOrigenInstance.destroy();
    chartOrigenInstance = new Chart(ctxOrigen, {
        type: 'doughnut',
        data: { labels: origenesLabels, datasets: [{ data: origenesData, backgroundColor: origenesColors, borderWidth: 0 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const label = origenesLabels[elements[0].index];
                    filtroOrigen = (filtroOrigen === label) ? 'Todos' : label; // Toggle
                    renderUI();
                }
            },
            onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }
        }
    });

    const estadosLabels = ['Al Día', 'Próxima', 'Finalizada'];
    const estadosColors = estadosLabels.map(l => {
        const baseColor = l === 'Al Día' ? '#4F46E5' : l === 'Próxima' ? '#F59E0B' : '#10B981';
        return (filtroEstado === 'Todas' || filtroEstado === l) ? baseColor : 'rgba(255,255,255,0.1)';
    });

    if (chartEstadoInstance) chartEstadoInstance.destroy();
    chartEstadoInstance = new Chart(ctxEstado, {
        type: 'bar',
        data: {
            labels: estadosLabels,
            datasets: [{
                data: [conteoEstados['Al Día'], conteoEstados['Próxima'], conteoEstados['Finalizada']],
                backgroundColor: estadosColors, borderRadius: 4
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const label = estadosLabels[elements[0].index];
                    filtroEstado = (filtroEstado === label) ? 'Todas' : label; // Toggle
                    actualizarPildorasFiltro();
                    renderUI();
                }
            },
            onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }
        }
    });
};

const actualizarPildorasFiltro = () => {
    document.querySelectorAll('.filtro-btn').forEach(b => {
        b.classList.remove('bg-primary', 'text-white', 'border-primary');
        b.classList.add('bg-transparent', 'text-slate-400', 'border-white/10');
        if (b.getAttribute('data-filter') === filtroEstado) {
            b.classList.remove('bg-transparent', 'text-slate-400', 'border-white/10');
            b.classList.add('bg-primary', 'text-white', 'border-primary');
        }
    });
};

document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        filtroEstado = e.target.getAttribute('data-filter');
        actualizarPildorasFiltro();
        renderUI();
    });
});

// --- Lógica del Modal y CRUD ---

const abrirModal = (modo = 'crear', deudaId = null) => {
    modalNuevaDeuda.classList.remove('hidden-view');
    const inputId = document.getElementById('input-deuda-id');
    
    if (modo === 'editar') {
        modalTitulo.textContent = 'Editar Deuda';
        const deuda = allDeudas.find(d => d.id === deudaId);
        if (deuda) {
            inputId.value = deuda.id;
            document.getElementById('input-origen').value = deuda.origen;
            document.getElementById('input-nombre').value = deuda.nombre;
            document.getElementById('input-monto').value = deuda.montoTotal;
            document.getElementById('input-cuotas').value = deuda.numeroCuotas;
            document.getElementById('input-fecha').value = deuda.fechaPrimeraCuota;
        }
    } else {
        modalTitulo.textContent = 'Agregar Nueva Deuda';
        formNuevaDeuda.reset();
        inputId.value = '';
    }
};

const cerrarModal = () => {
    modalNuevaDeuda.classList.add('hidden-view');
    formNuevaDeuda.reset();
};

btnNuevaDeuda.addEventListener('click', () => abrirModal('crear'));
btnCerrarModal.addEventListener('click', cerrarModal);
btnCancelarModal.addEventListener('click', cerrarModal);
document.getElementById('modal-overlay').addEventListener('click', cerrarModal);

// Delegación de eventos para botones dinámicos en la tabla
tablaDeudas.addEventListener('click', (e) => {
    const btnEditar = e.target.closest('.btn-editar');
    const btnEliminar = e.target.closest('.btn-eliminar');

    if (btnEditar) {
        const id = btnEditar.getAttribute('data-id');
        abrirModal('editar', id);
    }

    if (btnEliminar) {
        const id = btnEliminar.getAttribute('data-id');
        confirmarEliminacion(id);
    }
});

const confirmarEliminacion = (id) => {
    Swal.fire({
        title: '¿Estás seguro?',
        text: "¡No podrás revertir esto!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#3b82f6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "deudas", id));
                Swal.fire('Eliminada', 'La deuda ha sido borrada.', 'success');
                fetchDeudas(auth.currentUser.uid); // Recargar
            } catch (error) {
                console.error("Error al eliminar:", error);
                Swal.fire('Error', 'No se pudo eliminar.', 'error');
            }
        }
    });
};

formNuevaDeuda.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const btnSpan = btnGuardarDeuda.querySelector('span');
    btnSpan.textContent = 'Guardando...';
    btnGuardarDeuda.disabled = true;

    const id = document.getElementById('input-deuda-id').value;
    const dataObj = {
        origen: document.getElementById('input-origen').value.trim(),
        nombre: document.getElementById('input-nombre').value.trim(),
        montoTotal: parseFloat(document.getElementById('input-monto').value),
        numeroCuotas: parseInt(document.getElementById('input-cuotas').value, 10),
        fechaPrimeraCuota: document.getElementById('input-fecha').value
    };

    try {
        if (id) {
            // Actualizar
            await updateDoc(doc(db, "deudas", id), dataObj);
            Swal.fire('Actualizada', 'La deuda se actualizó con éxito', 'success');
        } else {
            // Crear
            await addDoc(collection(db, "deudas"), {
                ...dataObj,
                userId: user.uid,
                fechaCreacion: new Date()
            });
            Swal.fire('Guardada', 'Nueva deuda registrada', 'success');
        }
        cerrarModal();
        fetchDeudas(user.uid);
    } catch (error) {
        console.error("Error guardando:", error);
        Swal.fire('Error', 'Ocurrió un problema.', 'error');
    } finally {
        btnSpan.textContent = 'Guardar Deuda';
        btnGuardarDeuda.disabled = false;
    }
});

// Escuchar cambios de sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        fetchDeudas(user.uid);
    }
});
