import Icon from '../components/ui/Icon'

function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <p>
          <span className="footer-name">Signtext</span>
          {' '}reads sign language in real time.
        </p>
        <p className="privacy-note">
          <Icon name="lock" size="1.05em" ariaHidden />
          Video is processed on your device.
        </p>
      </div>
    </footer>
  )
}

export default Footer