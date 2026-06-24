import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const TITLES = [
  'Paneler på aktivt tak',
  'Manuell kalibrering',
  'Takpolygoner',
  'Montagesystem',
  'Panelgrupp',
  'Kartbild',
  'Takmått',
  'Taktyp',
  'Lutning',
  'Solpanel',
  'Tak',
];

const ROOF_MATERIALS = ['Falsat', 'Plegel tak', 'Tegelpannor', 'Betongpannor', 'Papptak', 'Plåttak', 'Duktak'];

const iconSvg = title => {
  const common = 'viewBox="0 0 42 30" aria-hidden="true" focusable="false"';
  if (title === 'Tak' || title === 'Takmått' || title === 'Takpolygoner') {
    return `<svg ${common}><path d="M3 17 21 4l18 13"/><path d="M8 15v11h26V15"/><path d="M17 26v-8h8v8"/></svg>`;
  }
  if (title === 'Taktyp') {
    return `<svg ${common}><path d="M3 17 21 4l18 13"/><path d="M9 15h24"/><path d="M12 15v10M18 15v10M24 15v10M30 15v10"/></svg>`;
  }
  if (title === 'Lutning') {
    return `<svg ${common}><path d="M4 25h34"/><path d="M7 24 35 8"/><path d="M10 24a8 8 0 0 1 4-6"/></svg>`;
  }
  if (title === 'Solpanel' || title === 'Paneler på aktivt tak' || title === 'Panelgrupp') {
    return `<svg ${common}><circle cx="32" cy="7" r="4"/><path d="M32 0v3M32 11v3M25 7h3M36 7h3"/><path d="M5 11h23l5 15H9z"/><path d="M11 11 9 26M18 11l-1 15M25 11l2 15M7 18h23"/></svg>`;
  }
  if (title === 'Montagesystem') {
    return `<svg ${common}><path d="M5 24h32"/><path d="M10 21 19 8h11l5 13"/><path d="M14 17h18"/><path d="M19 8v13M27 8v13"/></svg>`;
  }
  if (title === 'Manuell kalibrering') {
    return `<svg ${common}><path d="M5 22 28 5l8 10-23 17z"/><path d="m12 20 3 4M17 16l3 4M22 12l3 4M27 8l3 4"/></svg>`;
  }
  if (title === 'Kartbild') {
    return `<svg ${common}><path d="m4 6 10-3 14 4 10-3v20l-10 3-14-4-10 3z"/><path d="M14 3v20M28 7v20"/></svg>`;
  }
  return `<svg ${common}><rect x="5" y="5" width="32" height="20" rx="2"/></svg>`;
};

const materialSvg = material => {
  const common = 'viewBox="0 0 48 32" aria-hidden="true" focusable="false"';
  if (material === 'Falsat') {
    return `<svg ${common}><path d="M7 27 14 5h8l-5 22M18 27 25 5h8l-5 22M29 27 36 5h6l-4 22"/><path d="M14 5h8M25 5h8M36 5h6"/></svg>`;
  }
  if (material === 'Plegel tak') {
    return `<svg ${common}><path d="M5 27 11 6h28l4 21z"/><path d="M9 12h31M7 18h34M6 24h36M15 6l-3 21M22 6l-2 21M29 6v21M36 6l2 21"/></svg>`;
  }
  if (material === 'Tegelpannor') {
    return `<svg ${common}><path d="M4 9c4-5 8-5 12 0 4-5 8-5 12 0 4-5 8-5 12 0"/><path d="M4 16c4-5 8-5 12 0 4-5 8-5 12 0 4-5 8-5 12 0"/><path d="M4 23c4-5 8-5 12 0 4-5 8-5 12 0 4-5 8-5 12 0"/></svg>`;
  }
  if (material === 'Betongpannor') {
    return `<svg ${common}><path d="M5 27 9 6h30l4 21z"/><path d="M10 13c4-4 8-4 12 0 4-4 8-4 12 0M8 20c4-4 8-4 12 0 4-4 8-4 12 0M14 6l-3 21M24 6v21M34 6l4 21"/></svg>`;
  }
  if (material === 'Papptak') {
    return `<svg ${common}><path d="M5 25 14 8h25l5 17z"/><path d="m12 25 9-17M20 25l9-17M28 25l9-17"/></svg>`;
  }
  if (material === 'Plåttak') {
    return `<svg ${common}><path d="M5 27 12 5h8l-5 22M15 27 22 5h8l-5 22M25 27 32 5h8l-5 22M35 27 42 5"/><path d="M12 5h8M22 5h8M32 5h8"/></svg>`;
  }
  return `<svg ${common}><path d="M7 25 24 5l17 20"/><path d="M7 25h34M24 5v20M12 20l12 5 12-5"/></svg>`;
};

function sectionTitle(section) {
  const header = section.firstElementChild;
  const text = (header?.textContent || '').replace(/\s+/g, ' ').trim();
  return TITLES.find(title => text.startsWith(title) || text.includes(title)) || '';
}

function addIcon(container, markup, marker) {
  if (!container || container.querySelector(`[data-${marker}]`)) return;
  const icon = document.createElement('span');
  icon.dataset[marker] = 'true';
  icon.className = marker === 'roofMaterialIcon' ? 'roof-material-icon' : 'compact-section-icon';
  icon.innerHTML = markup;
  container.appendChild(icon);
}

function decorateSection(section) {
  const title = sectionTitle(section);
  if (!title) return;
  section.dataset.inspectorTitle = title;

  const header = section.firstElementChild;
  const titleBox = header?.firstElementChild;
  if (titleBox) addIcon(titleBox, iconSvg(title), 'compactSectionIcon');

  if (title === 'Taktyp') {
    ROOF_MATERIALS.forEach(material => {
      const button = Array.from(section.querySelectorAll('button')).find(item => (item.textContent || '').trim() === material);
      if (!button) return;
      button.dataset.roofMaterial = material;
      addIcon(button, materialSvg(material), 'roofMaterialIcon');
    });
  }

  if (title === 'Tak' || title === 'Takpolygoner') {
    Array.from(section.querySelectorAll('button')).forEach(button => {
      const label = (button.textContent || '').trim();
      if (!/^Tak\s*\d+/i.test(label)) return;
      button.dataset.compactRoofRow = 'true';
      if (!button.querySelector('[data-compact-roof-icon]')) {
        const icon = document.createElement('span');
        icon.dataset.compactRoofIcon = 'true';
        icon.className = 'compact-roof-row-icon';
        icon.innerHTML = iconSvg('Tak');
        button.insertBefore(icon, button.firstChild);
      }
    });
  }

  Array.from(section.querySelectorAll('div, p')).forEach(element => {
    const text = (element.textContent || '').trim();
    if (text.startsWith('Klicka på en ritad takyta') || text.startsWith('Valet sparas separat')) {
      element.dataset.compactHelpText = 'true';
    }
  });
}

function decorateInspector() {
  const host = document.querySelector('[data-map-host="settings"]');
  const list = host?.parentElement;
  if (!list) return;

  list.classList.add('solar-compact-inspector');
  const aside = list.closest('aside');
  aside?.classList.add('solar-compact-inspector-aside');

  const sections = [
    ...Array.from(list.querySelectorAll(':scope > section')),
    ...Array.from(host.querySelectorAll(':scope > section')),
  ];
  sections.forEach(decorateSection);
}

export default function CompactProjectInspector() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/projects/')) return undefined;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        decorateInspector();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [location.pathname]);

  return (
    <style>{`
      .solar-compact-inspector-aside {
        width: 282px !important;
        background: #f4f4f1 !important;
        padding: 8px !important;
      }
      .solar-compact-inspector {
        gap: 8px !important;
      }
      .solar-compact-inspector > section,
      .solar-compact-inspector > [data-map-host="settings"] > section {
        border: 2px solid #20252b !important;
        border-radius: 4px !important;
        background: #fff !important;
        box-shadow: none !important;
        padding: 8px 9px !important;
      }
      .solar-compact-inspector section > div:first-child {
        min-height: 30px;
        margin-bottom: 6px !important;
      }
      .solar-compact-inspector section > div:first-child > div:first-child {
        flex: 1 1 auto;
        justify-content: space-between;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #171717 !important;
      }
      .solar-compact-inspector section > div:first-child > div:first-child > svg {
        display: none !important;
      }
      .compact-section-icon,
      .roof-material-icon,
      .compact-roof-row-icon {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        color: #1f2937;
      }
      .compact-section-icon {
        width: 42px;
        height: 30px;
        margin-left: auto;
      }
      .compact-section-icon svg,
      .roof-material-icon svg,
      .compact-roof-row-icon svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .solar-compact-inspector [data-inspector-title="Taktyp"] button[data-roof-material] {
        display: flex !important;
        min-height: 35px;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        border: 1px solid transparent !important;
        border-radius: 2px !important;
        padding: 3px 5px 3px 8px !important;
        font-size: 12px !important;
        color: #20252b !important;
      }
      .solar-compact-inspector [data-inspector-title="Taktyp"] button[data-roof-material]:hover {
        border-color: #cbd5e1 !important;
        background: #f8fafc !important;
      }
      .solar-compact-inspector [data-inspector-title="Taktyp"] button[data-roof-material][class*="orange"] {
        border-color: #f97316 !important;
        background: #fff7ed !important;
        color: #c2410c !important;
      }
      .roof-material-icon {
        width: 46px;
        height: 31px;
      }
      .solar-compact-inspector button[data-compact-roof-row="true"] {
        display: grid !important;
        grid-template-columns: 30px minmax(0, 1fr) auto;
        align-items: center;
        min-height: 34px;
        border-radius: 2px !important;
        padding: 3px 6px !important;
      }
      .compact-roof-row-icon {
        width: 27px;
        height: 22px;
      }
      .solar-compact-inspector input,
      .solar-compact-inspector select,
      .solar-compact-inspector button[role="combobox"] {
        min-height: 32px !important;
        border-radius: 2px !important;
        border-color: #8b9199 !important;
        padding-top: 5px !important;
        padding-bottom: 5px !important;
      }
      .solar-compact-inspector label,
      .solar-compact-inspector [class*="text-[11px]"] {
        font-size: 11px !important;
      }
      .solar-compact-inspector button:not([data-roof-material]):not([data-compact-roof-row="true"]) {
        border-radius: 3px !important;
      }
      .solar-compact-inspector [data-compact-help-text="true"] {
        display: none !important;
      }
      .solar-compact-inspector [data-inspector-title="Paneler på aktivt tak"] > div:nth-child(2),
      .solar-compact-inspector [data-inspector-title="Solpanel"] [class*="rounded-xl"],
      .solar-compact-inspector [data-inspector-title="Montagesystem"] [class*="rounded-xl"] {
        border-radius: 3px !important;
      }
      .solar-compact-inspector [data-inspector-title="Taktyp"] > div:last-child {
        gap: 1px !important;
      }
      .solar-compact-inspector [data-inspector-title="Lutning"] .compact-section-icon {
        width: 50px;
      }
      .solar-compact-inspector [data-inspector-title="Solpanel"] .compact-section-icon,
      .solar-compact-inspector [data-inspector-title="Paneler på aktivt tak"] .compact-section-icon {
        width: 48px;
      }
    `}</style>
  );
}
