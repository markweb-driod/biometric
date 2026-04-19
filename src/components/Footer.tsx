export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>&copy; {year} NSUK Biometrics</span>
        <span>&middot;</span>
        <a href="mailto:info@nsuk.edu.ng">Contact</a>
      </div>
    </footer>
  );
}
