export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-top-inner">
          <div className="footer-brand">
            <span className="footer-brand-name">NSUK Biometric System</span>
            <span className="footer-brand-tagline">Secure identity verification</span>
          </div>
          <div className="footer-links">
            <a href="https://nsuk.edu.ng" target="_blank" rel="noopener noreferrer">
              nsuk.edu.ng
            </a>
            <a href="mailto:info@nsuk.edu.ng">Contact</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          <span>&copy; {year} Nasarawa State University, Keffi</span>
          <span>All rights reserved</span>
        </div>
      </div>
    </footer>
  );
}
