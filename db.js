import { app, auth, firebaseConfig } from './auth.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut as secSignOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const db = getFirestore(app);
const ADMIN_EMAIL = 'james.sura.r@gmail.com';

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
const saludoHeader = document.getElementById('saludo-header');
const btnDescargarPdf = document.getElementById('btn-descargar-pdf');

// Referencias de IA
const btnImportarIa = document.getElementById('btn-importar-ia');
const modalImportarIa = document.getElementById('modal-importar-ia');
const btnCerrarModalIa = document.getElementById('btn-cerrar-modal-ia');
const btnEjecutarIa = document.getElementById('btn-ejecutar-ia');
const iaInputTexto = document.getElementById('ia-input-texto');

const modalPreviewIa = document.getElementById('modal-preview-ia');
const btnCerrarPreviewIa = document.getElementById('btn-cerrar-preview-ia');
const btnCancelarPreviewIa = document.getElementById('btn-cancelar-preview-ia');
const btnGuardarPreviewIa = document.getElementById('btn-guardar-preview-ia');
const tablaPreviewIa = document.getElementById('tabla-preview-ia');

const inputGeminiKey = document.getElementById('input-gemini-key');
const btnGuardarLlaveIa = document.getElementById('btn-guardar-llave-ia');

let deudasExtraidasIA = [];
const btnAdmin = document.getElementById('btn-admin');
const modalAdmin = document.getElementById('modal-admin');
const btnCerrarAdmin = document.getElementById('btn-cerrar-admin');
const btnCerrarAdminMobile = document.getElementById('btn-cerrar-admin-mobile');
const formCrearUsuario = document.getElementById('form-crear-usuario');
const tablaUsuarios = document.getElementById('tabla-usuarios');

// Estado Global (Filtros PBI)
let allDeudas = [];
let filtroEstado = 'Todas';
let filtroOrigen = 'Todos';
let chartOrigenInstance = null;
let chartEstadoInstance = null;

// --- TEMA CLARO/OSCURO ---
const themeToggle = document.getElementById('theme-toggle');
const iconSun = document.getElementById('icon-sun');
const iconMoon = document.getElementById('icon-moon');
const htmlEl = document.documentElement;

const isDark = () => {
    if ('theme' in localStorage) return localStorage.theme === 'dark';
    return true; // Por defecto oscuro
};

const applyTheme = (dark) => {
    if (dark) {
        htmlEl.classList.add('dark');
        iconSun.classList.remove('hidden');
        iconMoon.classList.add('hidden');
        Chart.defaults.color = '#94A3B8';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    } else {
        htmlEl.classList.remove('dark');
        iconSun.classList.add('hidden');
        iconMoon.classList.remove('hidden');
        Chart.defaults.color = '#64748b';
        Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.1)';
    }
    if (chartOrigenInstance) chartOrigenInstance.update();
    if (chartEstadoInstance) chartEstadoInstance.update();
};

applyTheme(isDark());

themeToggle.addEventListener('click', () => {
    const isCurrentlyDark = htmlEl.classList.contains('dark');
    localStorage.theme = isCurrentlyDark ? 'light' : 'dark';
    applyTheme(!isCurrentlyDark);
});

// Helpers
const formatMoney = (amount) => {
    if (isNaN(amount)) return '$0';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
};

const calcularEstadoYCuota = (fechaPrimera, numCuotas) => {
    if (!fechaPrimera || numCuotas === 0 || isNaN(numCuotas)) {
        return { cuota: 'FINALIZADA', estado: 'Finalizada', cuotaNum: numCuotas, colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-400/10 dark:border-emerald-400/20' };
    }
    const hoy = new Date();
    const [año, mes, dia] = fechaPrimera.split('-');
    const fechaInicio = new Date(año, mes - 1, dia);
    let mesesPasados = (hoy.getFullYear() - fechaInicio.getFullYear()) * 12 + (hoy.getMonth() - fechaInicio.getMonth());
    let cuotaActual = mesesPasados + 1;

    if (cuotaActual <= 0) return { cuota: 0, estado: 'Próxima', cuotaNum: 0, colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/20' };
    if (cuotaActual > numCuotas) return { cuota: 'FINALIZADA', estado: 'Finalizada', cuotaNum: numCuotas, colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-400/10 dark:border-emerald-400/20' };
    return { cuota: `${cuotaActual} / ${numCuotas}`, estado: 'Al Día', cuotaNum: cuotaActual, colorClass: 'text-primary bg-primary/10 border-primary/20 dark:text-indigo-400 dark:bg-indigo-400/10 dark:border-indigo-400/20' };
};

const getProgressBarHtml = (cuotaActual, numCuotas) => {
    if (numCuotas === 0) return '-';
    let pct = Math.max(0, Math.min(100, (cuotaActual / numCuotas) * 100));
    let barColor = pct < 33 ? 'bg-red-500' : pct < 66 ? 'bg-amber-500' : 'bg-emerald-500';
    if (cuotaActual >= numCuotas) { pct = 100; barColor = 'bg-emerald-500'; }

    return `
        <div class="flex flex-col gap-1 w-full max-w-[150px] mx-auto">
            <div class="flex justify-between text-xs font-mono font-medium opacity-80">
                <span>${cuotaActual > numCuotas ? 'Fin' : cuotaActual}</span>
                <span>${numCuotas}</span>
            </div>
            <div class="h-2 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                <div class="h-full ${barColor} progress-bar-fill" style="width: ${pct}%"></div>
            </div>
        </div>
    `;
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
        tablaDeudas.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500 dark:text-red-400">Error al cargar datos.</td></tr>`;
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
        
        if (passEstado) {
            const org = data.origen || 'Otro';
            conteoOrigenes[org] = (conteoOrigenes[org] || 0) + 1;
        }
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
            <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                <td class="p-4 font-medium">${data.origen || '-'}</td>
                <td class="p-4">${data.nombre || '-'}</td>
                <td class="p-4 text-right font-medium font-mono">${formatMoney(monto)}</td>
                <td class="p-4 text-center">${getProgressBarHtml(calculo.cuotaNum, cuotas)}</td>
                <td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-xs border font-medium ${calculo.colorClass}">${calculo.estado}</span></td>
                <td class="p-4 text-center pdf-export-hide no-print opacity-50 group-hover:opacity-100 transition-opacity">
                    <div class="flex items-center justify-center gap-2">
                        <button data-id="${data.id}" class="btn-editar text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 p-1" title="Editar">
                            <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button data-id="${data.id}" class="btn-eliminar text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-1" title="Eliminar">
                            <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tablaDeudas.innerHTML = deudasFiltradas.length ? deudasHtml : `<tr><td colspan="6" class="p-8 text-center text-slate-500 dark:text-slate-400">No hay deudas que coincidan con el filtro.</td></tr>`;
    statTotal.textContent = formatMoney(sumaTotal);
    statMensual.textContent = formatMoney(sumaMensualEstimada);
    statActivas.textContent = activasCount.toString();
    actualizarGraficos(conteoOrigenes, conteoEstados);
};

const paletaOrigenes = ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#ef4444', '#14b8a6'];
const actualizarGraficos = (conteoOrigenes, conteoEstados) => {
    const ctxOrigen = document.getElementById('chartOrigen').getContext('2d');
    const ctxEstado = document.getElementById('chartEstado').getContext('2d');
    const isDarkTheme = htmlEl.classList.contains('dark');
    const dimColor = isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const origenesLabels = Object.keys(conteoOrigenes);
    const origenesData = Object.values(conteoOrigenes);
    const origenesColors = origenesLabels.map((l, i) => (filtroOrigen === 'Todos' || filtroOrigen === l) ? paletaOrigenes[i % paletaOrigenes.length] : dimColor);

    if (chartOrigenInstance) chartOrigenInstance.destroy();
    chartOrigenInstance = new Chart(ctxOrigen, {
        type: 'doughnut',
        data: { labels: origenesLabels, datasets: [{ data: origenesData, backgroundColor: origenesColors, borderWidth: 0 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const label = origenesLabels[elements[0].index];
                    filtroOrigen = (filtroOrigen === label) ? 'Todos' : label;
                    renderUI();
                }
            },
            onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }
        }
    });

    const estadosLabels = ['Al Día', 'Próxima', 'Finalizada'];
    const estadosColors = estadosLabels.map(l => {
        const baseColor = l === 'Al Día' ? '#4F46E5' : l === 'Próxima' ? '#F59E0B' : '#10B981';
        return (filtroEstado === 'Todas' || filtroEstado === l) ? baseColor : dimColor;
    });

    if (chartEstadoInstance) chartEstadoInstance.destroy();
    chartEstadoInstance = new Chart(ctxEstado, {
        type: 'bar',
        data: { labels: estadosLabels, datasets: [{ data: [conteoEstados['Al Día'], conteoEstados['Próxima'], conteoEstados['Finalizada']], backgroundColor: estadosColors, borderRadius: 4 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const label = estadosLabels[elements[0].index];
                    filtroEstado = (filtroEstado === label) ? 'Todas' : label;
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
        b.classList.add('bg-transparent', 'text-slate-500', 'dark:text-slate-400', 'border-slate-200', 'dark:border-white/10');
        if (b.getAttribute('data-filter') === filtroEstado) {
            b.classList.remove('bg-transparent', 'text-slate-500', 'dark:text-slate-400', 'border-slate-200', 'dark:border-white/10');
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

// --- EXPORTAR A PDF (REPORTE PROFESIONAL jsPDF) ---
btnDescargarPdf.addEventListener('click', () => {
    // 1. Obtener la librería
    const { jsPDF } = window.jspdf;
    // Orientación paisaje, unidad puntos, tamaño carta
    const doc = new jsPDF('landscape', 'pt', 'letter');
    
    const isDarkTheme = htmlEl.classList.contains('dark');
    const primaryColor = [79, 70, 229]; // #4F46E5
    const textColor = isDarkTheme ? [220, 220, 220] : [15, 23, 42];
    const bgColor = isDarkTheme ? [15, 23, 42] : [255, 255, 255];
    
    // Si queremos un PDF estilo oscuro, pintamos el fondo (opcional, pero profesionalmente es mejor PDF claro)
    // Para reportes financieros impresos, forzaremos SIEMPRE un fondo claro por legibilidad en papel.
    
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;

    // --- ENCABEZADO ---
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // Siempre oscuro para el PDF
    doc.setFont("helvetica", "bold");
    doc.text("Finanzas SF - Reporte de Deudas", 40, 50);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Gris
    doc.setFont("helvetica", "normal");
    doc.text(`Generado el: ${new Date().toLocaleString('es-CL')}`, 40, 70);
    doc.text(`Filtro activo: Origen (${filtroOrigen}) | Estado (${filtroEstado})`, 40, 85);

    // --- KPIs (RESUMEN EJECUTIVO) ---
    doc.setDrawColor(226, 232, 240); // Borde
    doc.setFillColor(248, 250, 252); // Fondo cajita
    doc.roundedRect(40, 110, 220, 60, 5, 5, 'FD'); // X, Y, Ancho, Alto, Radios
    doc.roundedRect(280, 110, 220, 60, 5, 5, 'FD');
    doc.roundedRect(520, 110, 220, 60, 5, 5, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Total Adeudado", 50, 130);
    doc.text("Pago Mensual Estimado", 290, 130);
    doc.text("Deudas Activas", 530, 130);

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(statTotal.textContent, 50, 155);
    doc.text(statMensual.textContent, 290, 155);
    doc.text(statActivas.textContent, 530, 155);

    // --- GRÁFICOS (Extraer del Canvas real) ---
    // Necesitamos asegurarnos de que el fondo del gráfico sea blanco antes de extraer, 
    // pero Chart.js por defecto tiene fondo transparente. 
    // La forma fácil: extraer con toDataURL y pintar un fondo en jsPDF.
    
    // Nota: toDataURL funciona bien si el canvas está renderizado.
    const addChartToPdf = (canvasId, x, y, w, h) => {
        const canvas = document.getElementById(canvasId);
        if(canvas) {
            // Pintar un cuadrado blanco de fondo en el PDF para asegurar contraste
            doc.setFillColor(255, 255, 255);
            doc.rect(x, y, w, h, 'F');
            const imgData = canvas.toDataURL("image/png", 1.0);
            doc.addImage(imgData, 'PNG', x, y, w, h);
        }
    };

    doc.setFontSize(12);
    doc.text("Deuda por Origen", 150, 210);
    doc.text("Estado de las Cuotas", 500, 210);
    
    addChartToPdf('chartOrigen', 40, 230, 250, 150);
    addChartToPdf('chartEstado', 360, 230, 350, 150);

    // --- TABLA DE DATOS ---
    // Recopilar datos filtrados
    const deudasFiltradas = allDeudas.filter(data => {
        const passEstado = filtroEstado === 'Todas' || data.calculo.estado === filtroEstado;
        const passOrigen = filtroOrigen === 'Todos' || (data.origen || 'Otro') === filtroOrigen;
        return passEstado && passOrigen;
    });

    const tableData = deudasFiltradas.map(d => [
        d.origen || '-',
        d.nombre || '-',
        formatMoney(d.montoTotal || 0),
        d.numeroCuotas > 0 ? `${d.calculo.cuotaNum} de ${d.numeroCuotas}` : 'Sin cuotas',
        d.calculo.estado
    ]);

    doc.autoTable({
        startY: 420,
        head: [['Origen', 'Nombre', 'Monto Total', 'Cuotas', 'Estado']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
            fillColor: primaryColor,
            textColor: 255,
            fontStyle: 'bold'
        },
        styles: { 
            font: 'helvetica', 
            fontSize: 10,
            textColor: 50
        },
        alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
        margin: { left: 40, right: 40 },
        // Paginación: agregar número de página
        didDrawPage: function (data) {
            let str = "Página " + doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(str, data.settings.margin.left, pageHeight - 20);
        }
    });

    // --- DESCARGAR ---
    doc.save(`Reporte_Finanzas_${new Date().toLocaleDateString('es-CL')}.pdf`);
});

// CRUD Deudas
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

const cerrarModal = () => { modalNuevaDeuda.classList.add('hidden-view'); formNuevaDeuda.reset(); };

btnNuevaDeuda.addEventListener('click', () => abrirModal('crear'));
btnCerrarModal.addEventListener('click', cerrarModal);
btnCancelarModal.addEventListener('click', cerrarModal);
document.getElementById('modal-overlay').addEventListener('click', cerrarModal);

tablaDeudas.addEventListener('click', (e) => {
    const btnEditar = e.target.closest('.btn-editar');
    const btnEliminar = e.target.closest('.btn-eliminar');
    if (btnEditar) abrirModal('editar', btnEditar.getAttribute('data-id'));
    if (btnEliminar) confirmarEliminacion(btnEliminar.getAttribute('data-id'));
});

const confirmarEliminacion = (id) => {
    Swal.fire({
        title: '¿Estás seguro?', text: "¡No podrás revertir esto!", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#3b82f6',
        confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "deudas", id));
                Swal.fire('Eliminada', 'La deuda ha sido borrada.', 'success');
                fetchDeudas(auth.currentUser.uid);
            } catch (error) { Swal.fire('Error', 'No se pudo eliminar.', 'error'); }
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
            // Verificar si hubo celebración
            const oldData = allDeudas.find(d => d.id === id);
            if (oldData && oldData.calculo.estado !== 'Finalizada') {
                const newState = calcularEstadoYCuota(dataObj.fechaPrimeraCuota, dataObj.numeroCuotas).estado;
                if (newState === 'Finalizada') {
                    // 🎉 CONFETTI!
                    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
                }
            }

            await updateDoc(doc(db, "deudas", id), dataObj);
            Swal.fire('Actualizada', 'La deuda se actualizó con éxito', 'success');
        } else {
            // Si crean una deuda que ya está finalizada (para histórico)
            const newState = calcularEstadoYCuota(dataObj.fechaPrimeraCuota, dataObj.numeroCuotas).estado;
            if (newState === 'Finalizada') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

            await addDoc(collection(db, "deudas"), { ...dataObj, userId: user.uid, fechaCreacion: new Date() });
            Swal.fire('Guardada', 'Nueva deuda registrada', 'success');
        }
        cerrarModal();
        fetchDeudas(user.uid);
    } catch (error) { Swal.fire('Error', 'Ocurrió un problema.', 'error'); }
    finally { btnSpan.textContent = 'Guardar Deuda'; btnGuardarDeuda.disabled = false; }
});

// --- LÓGICA DE ADMINISTRACIÓN ---
const cargarUsuarios = async () => {
    tablaUsuarios.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-slate-400">Cargando usuarios...</td></tr>`;
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        let html = '';
        querySnapshot.forEach(doc => {
            const u = doc.data();
            html += `
                <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td class="p-4 font-medium text-slate-900 dark:text-white">${u.nombre || '-'}</td>
                    <td class="p-4 text-slate-600 dark:text-slate-300">${u.email}</td>
                    <td class="p-4 text-center">
                        <button data-email="${u.email}" class="btn-reset text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 p-1" title="Restablecer Contraseña">
                            <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        });
        tablaUsuarios.innerHTML = html || `<tr><td colspan="3" class="p-8 text-center text-slate-500">No hay usuarios registrados.</td></tr>`;
    } catch (error) {
        console.error("Error cargando usuarios:", error);
        tablaUsuarios.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-red-500">Sin permisos o error.</td></tr>`;
    }
};

const abrirAdmin = () => { modalAdmin.classList.remove('hidden-view'); cargarUsuarios(); };
const cerrarAdmin = () => modalAdmin.classList.add('hidden-view');

btnAdmin.addEventListener('click', abrirAdmin);
btnCerrarAdmin.addEventListener('click', cerrarAdmin);
btnCerrarAdminMobile.addEventListener('click', cerrarAdmin);
document.getElementById('modal-admin-overlay').addEventListener('click', cerrarAdmin);

formCrearUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-usuario');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>Creando...</span>';
    btn.disabled = true;

    const nombre = document.getElementById('admin-input-nombre').value.trim();
    const email = document.getElementById('admin-input-email').value.trim();
    const password = document.getElementById('admin-input-pass').value;

    try {
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp" + Date.now());
        const secAuth = getAuth(secondaryApp);
        
        const cred = await createUserWithEmailAndPassword(secAuth, email, password);
        const newUid = cred.user.uid;
        await secSignOut(secAuth); 

        await addDoc(collection(db, "users"), { uid: newUid, nombre, email, fechaCreacion: new Date() });
        Swal.fire('¡Éxito!', 'Usuario creado correctamente.', 'success');
        formCrearUsuario.reset();
        cargarUsuarios();
    } catch (error) { Swal.fire('Error', error.message, 'error'); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
});

tablaUsuarios.addEventListener('click', async (e) => {
    const btnReset = e.target.closest('.btn-reset');
    if (btnReset) {
        const emailToReset = btnReset.getAttribute('data-email');
        try {
            await sendPasswordResetEmail(auth, emailToReset);
            Swal.fire('Enviado', `Correo de restablecimiento enviado a ${emailToReset}`, 'success');
        } catch (error) { Swal.fire('Error', 'No se pudo enviar el correo', 'error'); }
    }
});

const updateGreeting = (userEmail) => {
    const hour = new Date().getHours();
    let saludo = 'Hola';
    if (hour < 12) saludo = 'Buenos días';
    else if (hour < 20) saludo = 'Buenas tardes';
    else saludo = 'Buenas noches';
    
    const nameStr = userEmail ? userEmail.split('@')[0] : '';
    // Capitalize first letter
    const capitalized = nameStr.charAt(0).toUpperCase() + nameStr.slice(1);
    saludoHeader.textContent = `${saludo}${capitalized ? ', ' + capitalized : ''}`;
}

// Escuchar cambios de sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        updateGreeting(user.email);
        fetchDeudas(user.uid);
        if (user.email === ADMIN_EMAIL) {
            btnAdmin.classList.remove('hidden-view');
            // Cargar llave IA si existe
            if (localStorage.geminiApiKey) {
                inputGeminiKey.value = localStorage.geminiApiKey;
            }
        }
        else { btnAdmin.classList.add('hidden-view'); cerrarAdmin(); }
    } else {
        btnAdmin.classList.add('hidden-view');
        cerrarAdmin();
    }
});

// --- IMPORTADOR MÁGICO CON IA (GEMINI) ---
btnGuardarLlaveIa.addEventListener('click', () => {
    const key = inputGeminiKey.value.trim();
    if (key) {
        localStorage.geminiApiKey = key;
        Swal.fire('Guardada', 'Clave API guardada en el navegador.', 'success');
    } else {
        localStorage.removeItem('geminiApiKey');
        Swal.fire('Borrada', 'Clave API eliminada.', 'info');
    }
});

const cerrarModalIa = () => modalImportarIa.classList.add('hidden-view');
btnImportarIa.addEventListener('click', () => {
    if (!localStorage.geminiApiKey) {
        Swal.fire('Falta Configuración', 'Primero debes ingresar tu clave API de Gemini en el Panel de Admin.', 'warning');
        return;
    }
    iaInputTexto.value = '';
    modalImportarIa.classList.remove('hidden-view');
});
btnCerrarModalIa.addEventListener('click', cerrarModalIa);
document.getElementById('modal-ia-overlay').addEventListener('click', cerrarModalIa);

const cerrarPreviewIa = () => modalPreviewIa.classList.add('hidden-view');
btnCerrarPreviewIa.addEventListener('click', cerrarPreviewIa);
btnCancelarPreviewIa.addEventListener('click', cerrarPreviewIa);

btnEjecutarIa.addEventListener('click', async () => {
    const textoCrudo = iaInputTexto.value.trim();
    if (!textoCrudo) {
        Swal.fire('Error', 'Pega el texto del estado de cuenta primero.', 'error');
        return;
    }

    const apiKey = localStorage.geminiApiKey;
    const btnSpan = btnEjecutarIa.querySelector('span');
    const originalText = btnSpan.textContent;
    btnSpan.textContent = 'Analizando con IA...';
    btnEjecutarIa.disabled = true;

    const prompt = `
Eres un experto analista financiero. Tu tarea es extraer deudas o compras en cuotas a partir de este texto desordenado de un estado de cuenta bancario.
Responde ÚNICAMENTE con un arreglo en formato JSON válido. Ni una sola palabra más, sin bloques de markdown.
Estructura exacta por objeto:
{
  "origen": "string (nombre de tienda o banco. Ej: CMR, Ripley, Supermercado)",
  "nombre": "string (descripción de la compra)",
  "montoTotal": numero (el valor total de la deuda. Sin simbolos, solo el numero),
  "numeroCuotas": numero (cantidad total de cuotas. Si dice 03/12, el total es 12. Si no es en cuotas, pon 0),
  "fechaPrimeraCuota": "string (YYYY-MM-DD. Aproxímala si es necesario, o usa la fecha de la transacción)"
}

Texto a analizar:
${textoCrudo}
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) throw new Error("Error en la API de Gemini (Revisa tu clave)");

        const data = await response.json();
        let iaText = data.candidates[0].content.parts[0].text;
        
        // Limpiar markdown residual de la respuesta
        iaText = iaText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        deudasExtraidasIA = JSON.parse(iaText);
        
        if (!Array.isArray(deudasExtraidasIA) || deudasExtraidasIA.length === 0) {
            throw new Error("No se encontraron deudas claras.");
        }

        // Renderizar Preview
        cerrarModalIa();
        let htmlPreview = '';
        deudasExtraidasIA.forEach(d => {
            htmlPreview += `
                <tr class="bg-white/5 border-b border-black/5 dark:border-white/5">
                    <td class="p-3 font-medium">${d.origen || '-'}</td>
                    <td class="p-3">${d.nombre || '-'}</td>
                    <td class="p-3 text-right font-mono">${formatMoney(d.montoTotal)}</td>
                    <td class="p-3 text-center">${d.numeroCuotas || 0}</td>
                    <td class="p-3 font-mono text-xs">${d.fechaPrimeraCuota || '-'}</td>
                </tr>
            `;
        });
        tablaPreviewIa.innerHTML = htmlPreview;
        modalPreviewIa.classList.remove('hidden-view');

    } catch (error) {
        console.error(error);
        Swal.fire('Oops...', 'La IA no pudo procesar este texto o falló la clave. Intenta de nuevo.', 'error');
    } finally {
        btnSpan.textContent = originalText;
        btnEjecutarIa.disabled = false;
    }
});

btnGuardarPreviewIa.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    btnGuardarPreviewIa.textContent = 'Guardando...';
    btnGuardarPreviewIa.disabled = true;

    try {
        const promesas = deudasExtraidasIA.map(dObj => {
            return addDoc(collection(db, "deudas"), {
                origen: dObj.origen || 'Banco',
                nombre: dObj.nombre || 'Importado por IA',
                montoTotal: Number(dObj.montoTotal) || 0,
                numeroCuotas: Number(dObj.numeroCuotas) || 0,
                fechaPrimeraCuota: dObj.fechaPrimeraCuota || new Date().toISOString().split('T')[0],
                userId: user.uid,
                fechaCreacion: new Date()
            });
        });

        await Promise.all(promesas);
        Swal.fire('¡Magia Pura!', `Se importaron ${deudasExtraidasIA.length} deudas exitosamente.`, 'success');
        
        cerrarPreviewIa();
        fetchDeudas(user.uid);
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Hubo un problema al guardar las deudas.', 'error');
    } finally {
        btnGuardarPreviewIa.innerHTML = 'Guardar Todas';
        btnGuardarPreviewIa.disabled = false;
    }
});
