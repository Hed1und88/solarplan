import AeroToolStyleSolarWorkbench from '@/components/project/AeroToolStyleSolarWorkbench';
import Project3DLocalImagePicker from '@/components/project/Project3DLocalImagePicker';

export default function SolarShadowAnalysis() {
  return (
    <div className="solarplan-light-workbench">
      <Project3DLocalImagePicker />
      <AeroToolStyleSolarWorkbench />
    </div>
  );
}
