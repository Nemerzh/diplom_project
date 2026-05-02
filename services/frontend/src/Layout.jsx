import { NavLink, Outlet } from "react-router-dom";
import { AppFooter, styles } from "./ui.jsx";

const links = [
  ["Дашборд", "/"],
  ["Об'єкти", "/sites"],
  ["Лічильники", "/meters"],
  ["Покази", "/readings"],
  ["Топологія", "/topology"],
  ["Електромережа", "/network"],
  ["Звіти", "/reports"],
  ["Сповіщення", "/alerts"],
  ["Стан системи", "/system"],
  ["Адмін панель", "/admin/enterprises"]
];

export default function Layout() {
  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.container}>
          <div style={styles.headerStack}>
            <h1 style={styles.title}>Платформа обліку електроенергії</h1>
            <nav style={styles.nav} aria-label="Основна навігація">
              {links.map(([label, path]) => (
                <NavLink
                  key={path}
                  to={path}
                  style={({ isActive }) => ({
                    ...styles.link,
                    background: isActive ? "#dbeafe" : "#fff",
                    borderColor: isActive ? "#93c5fd" : "#d7dbe7"
                  })}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main style={styles.content}>
        <div style={styles.container}>
          <Outlet />
        </div>
      </main>
      <AppFooter variant="operator" />
    </div>
  );
}
