/**
 * Layout wrapper for tenant user pages.
 *
 * Renders a top navigation bar and main content area for tenant-scoped pages.
 * Navigation links will grow each sprint as new pages are added.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './TenantLayout.module.css';

function TenantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <span className={styles.brand}>Fieldmouse</span>
        <nav className={styles.nav}>
          <NavLink
            to="/app/users"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            Users
          </NavLink>
        </nav>
        <div className={styles.headerRight}>
          {user && (
            <span className={styles.userEmail}>{user.email}</span>
          )}
          <button onClick={handleLogout} className={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

export default TenantLayout;
