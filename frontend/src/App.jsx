import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Translate from './pages/Translate'
import AccountPending from './pages/AccountPending'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar />
        <Routes>
          <Route path="/" element={<Translate />} />
          <Route path="/signin" element={<AccountPending mode="signin" />} />
          <Route path="/signup" element={<AccountPending mode="signup" />} />
          <Route path="*" element={<Translate />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App