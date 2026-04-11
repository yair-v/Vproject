import logo from '../assets/yv-logo.png';

export default function AppBrand() {
    return (
        <div className="app-brand">
            <img src={logo} alt="Yair Vahaba" className="app-brand-logo" />
        </div>
    );
}