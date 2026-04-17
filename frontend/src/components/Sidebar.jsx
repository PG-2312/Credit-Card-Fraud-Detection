import { NavLink } from 'react-router-dom'
import {
  Home, LayoutDashboard, Search, BarChart3, ScrollText,
  Sun, Moon, Shield
} from 'lucide-react'

const links = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/predict', icon: Search, label: 'Predict' },
  { to: '/models', icon: BarChart3, label: 'Model Comparison' },
  { to: '/transactions', icon: ScrollText, label: 'Transactions' },
]

export default function Sidebar({ dark, setDark }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Shield size={22} />
        </div>
        <div>
          <h1>FraudGuard</h1>
          <span>ML Detection System</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          onClick={() => setDark(!dark)}
          className="sidebar-link"
          style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'none' }}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          {dark ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </aside>
  )
}
