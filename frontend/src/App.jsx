import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import RequireAuth from './components/RequireAuth'
import History from './pages/History'
import NotFound from './pages/NotFound'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Translate from './pages/Translate'
import AuthProvider from './context/AuthProvider'
import ThemeProvider from './context/ThemeProvider'
import ToastProvider from './context/ToastProvider'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <div className="app-shell">
              <a className="skip-link" href="#main-content">
                Skip to main content
              </a>
              <Navbar />
              <div id="main-content" className="app-content" tabIndex={-1}>
                <Routes>
                  <Route path="/" element={<Translate />} />
                  <Route path="/translate" element={<Translate />} />
                  <Route path="/signin" element={<SignIn />} />
                  <Route path="/signup" element={<SignUp />} />
                  <Route
                    path="/history"
                    element={
                      <RequireAuth>
                        <History />
                      </RequireAuth>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
              <Footer />
            </div>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App