import { NavLink, Outlet } from "react-router-dom";
import { AppFooter, styles } from "./ui.jsx";

const links = [
  ["Підприємства (CRUD)", "/admin/enterprises"],
  ["Об'єкти (CRUD)", "/admin/sites"],
  ["Лічильники (CRUD)", "/admin/meters"],
  ["Електромережа", "/admin/grid"],
  ["Правила сповіщень (CRUD)", "/admin/alert-rules"],
  ["Назад до оператора", "/"]
];

export default function AdminLayout() {
  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.container}>
          <div style={styles.headerCard}>
            <h1 style={styles.title}>Адміністративна панель</h1>
            <div style={styles.nav}>
              {links.map(([label, path]) => (
                <NavLink
                  key={path}
                  to={path}
                  style={({ isActive }) => ({
                    ...styles.link,
                    background: isActive ? "#fee2e2" : "#fff",
                    borderColor: isActive ? "#fca5a5" : "#d7dbe7"
                  })}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </header>
      <main style={styles.content}>
        <div style={styles.container}>
          <Outlet />
        </div>
      </main>
      <AppFooter variant="admin" />
    </div>
  );
}
