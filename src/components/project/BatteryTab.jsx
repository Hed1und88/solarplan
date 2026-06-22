import './BatteryPlannerGlobals';
import BatteryPlannerV3 from './BatteryPlannerV3';
import ElectricalProductQuickAdd from './ElectricalProductQuickAdd';

export default function BatteryTab(props) {
  return (
    <div className="space-y-4">
      <ElectricalProductQuickAdd />
      <BatteryPlannerV3 {...props} />
    </div>
  );
}
