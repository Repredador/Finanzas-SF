import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBJTgNyYPXrdlzoM97wjE05K8vdQUFZ6qc",
  authDomain: "finanzasfamiliares-app.firebaseapp.com",
  projectId: "finanzasfamiliares-app",
  storageBucket: "finanzasfamiliares-app.firebasestorage.app",
  messagingSenderId: "760314653481",
  appId: "1:760314653481:web:1ce6ad9b47b8e66f77e538",
  measurementId: "G-EJFGLMZD60"
};

// Inicializar Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Referencias del DOM
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginSpinner = document.getElementById('login-spinner');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const userEmailDisplay = document.getElementById('user-email');

// UI Helpers
const showSpinner = () => {
    loginSpinner.classList.remove('hidden');
    loginBtn.querySelector('span').textContent = 'Ingresando...';
    loginBtn.disabled = true;
    loginBtn.classList.add('opacity-75', 'cursor-not-allowed');
};

const hideSpinner = () => {
    loginSpinner.classList.add('hidden');
    loginBtn.querySelector('span').textContent = 'Ingresar';
    loginBtn.disabled = false;
    loginBtn.classList.remove('opacity-75', 'cursor-not-allowed');
};

const showError = (message) => {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
    // Hide error after 5 seconds
    setTimeout(() => {
        loginError.classList.add('hidden');
    }, 5000);
};

// Manejador de estado de autenticación (Observador)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario logueado
        loginScreen.classList.add('hidden-view');
        dashboardScreen.classList.remove('hidden-view');
        userEmailDisplay.textContent = user.email;
    } else {
        // Usuario NO logueado
        dashboardScreen.classList.add('hidden-view');
        loginScreen.classList.remove('hidden-view');
        userEmailDisplay.textContent = '';
    }
});

// Evento de Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    loginError.classList.add('hidden');
    showSpinner();
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Limpiar formulario tras login exitoso
        loginForm.reset();
    } catch (error) {
        console.error("Error en login:", error);
        
        let errorMessage = "Credenciales incorrectas.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = "Correo o contraseña incorrectos.";
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = "Demasiados intentos. Intenta más tarde.";
        }
        
        showError(errorMessage);
    } finally {
        hideSpinner();
    }
});

// Evento de Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
});
