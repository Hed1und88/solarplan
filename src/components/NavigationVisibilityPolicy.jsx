export default function NavigationVisibilityPolicy() {
  return (
    <style>{`
      aside a[href*="solarplan-3d-projektering"],
      nav a[href*="solarplan-3d-projektering"],
      aside a[href*="3d-projektering"],
      nav a[href*="3d-projektering"],
      aside a[href*="3d-solanalys"],
      nav a[href*="3d-solanalys"],
      aside [aria-label="3D Projektering"],
      nav [aria-label="3D Projektering"],
      aside [title="3D Projektering"],
      nav [title="3D Projektering"] {
        display: none !important;
      }
    `}</style>
  );
}
