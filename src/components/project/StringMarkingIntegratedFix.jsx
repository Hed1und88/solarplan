import React from 'react';
import StringMarkingEntryIntegrated from './StringMarkingEntryIntegrated.jsx';

export default function StringMarkingIntegratedFix(props) {
  return (
    <>
      <style>{`
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(1) > div:first-child > div:first-child {
          font-size: 0 !important;
        }
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(1) > div:first-child > div:first-child:after {
          content: 'MPPT och PV-ingångar' !important;
          font-size: .875rem !important;
        }
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(1) > div:nth-child(2) > div:first-child {
          display: none !important;
        }

        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(2) > div:first-child > div:first-child {
          font-size: 0 !important;
        }
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(2) > div:first-child > div:first-child:after {
          content: 'Vald PV-ingång' !important;
          font-size: .875rem !important;
        }
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(2) > div:nth-child(2) > div.space-y-2 {
          display: block !important;
        }
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(2) > div:nth-child(2) > div.space-y-2 > :nth-child(1),
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(2) > div:nth-child(2) > div.space-y-2 > :nth-child(2) {
          display: none !important;
        }

        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(3) > div:first-child > div:first-child {
          font-size: .875rem !important;
        }
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(3) > div:first-child > div:first-child:after {
          content: none !important;
        }
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(3) > div:nth-child(2) > div.space-y-2 > :nth-child(1),
        .string-inverter-entry aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(3) > div:nth-child(2) > div.space-y-2 > :nth-child(2) {
          display: block !important;
        }

        .string-inverter-entry.no-inverter-selected aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(1),
        .string-inverter-entry.no-inverter-selected aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(2) {
          display: none !important;
        }
        .string-inverter-entry.no-inverter-selected aside[class*="w-[310px]"] > div.space-y-3 > section:nth-of-type(3) {
          display: block !important;
        }
      `}</style>
      <StringMarkingEntryIntegrated {...props} />
    </>
  );
}
