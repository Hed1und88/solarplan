import StringMarkingTabV7 from './StringMarkingTabV7.jsx';

export default function StringMarkingTabWorkspace(props) {
  return (
    <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1800px] -translate-x-1/2">
      <StringMarkingTabV7 {...props} />
    </div>
  );
}
