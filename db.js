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
import { deudasExcel } from './migration.js';

const db = getFirestore(app);

// Referencias del DOM
const tablaDeudas = document.getElementById('tabla-deudas');
const statTotal = document.getElementById('stat-total');
const statMensual = document.getElementById('stat-mensual');
const btnImportar = document.getElementById('btn-importar');
const msgImportacion = document.getElementById('msg-importacion');

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
    // Parse fecha (asume YYYY-MM-DD)
    const [año, mes, dia] = fechaPrimera.split('-');
    const fechaInicio = new Date(año, mes - 1, dia); // Meses en JS son 0-11
    
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
        let contador = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            contador++;
            
            const monto = data.montoTotal || 0;
            const cuotas = data.numeroCuotas || 0;
            const calculo = calcularEstadoYCuota(data.fechaPrimeraCuota, cuotas);
            
            // Calculo de totales (ignorar si está finalizada)
            if (calculo.estado !== 'Finalizada') {
                sumaTotal += monto;
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

        if (contador === 0) {
            tablaDeudas.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">No tienes deudas registradas. ¡Usa el botón de importar!</td></tr>`;
        } else {
            tablaDeudas.innerHTML = deudasHtml;
        }

        statTotal.textContent = formatMoney(sumaTotal);
        statMensual.textContent = formatMoney(sumaMensualEstimada);

    } catch (error) {
        console.error("Error al obtener deudas:", error);
        tablaDeudas.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">Error al cargar datos. Revisa la consola.</td></tr>`;
    }
};

// Función de Migración (Solo un uso temporal)
const importarExcelAFirestore = async (userId) => {
    if (!confirm("¿Estás seguro de importar los 27 registros? Esto puede tardar unos segundos y solo deberías hacerlo una vez.")) return;
    
    btnImportar.disabled = true;
    msgImportacion.classList.remove('hidden');
    
    try {
        let importadas = 0;
        for (const deuda of deudasExcel) {
            await addDoc(collection(db, "deudas"), {
                ...deuda,
                userId: userId,
                fechaCreacion: new Date()
            });
            importadas++;
        }
        alert(`¡Éxito! Se importaron ${importadas} deudas a Firestore.`);
        btnImportar.classList.add('hidden'); // Ocultar el botón tras éxito
        cargarDeudas(userId); // Recargar la tabla
    } catch (error) {
        console.error("Error importando:", error);
        alert("Ocurrió un error en la importación. Revisa la consola.");
    } finally {
        msgImportacion.classList.add('hidden');
        btnImportar.disabled = false;
    }
};

// Escuchar cambios de sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Al entrar, cargar datos
        cargarDeudas(user.uid);
        
        // Habilitar el botón de importar asignando el userId
        btnImportar.onclick = () => importarExcelAFirestore(user.uid);
    }
});
