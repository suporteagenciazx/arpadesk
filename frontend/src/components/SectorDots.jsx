import { getEnabledSectorsWithColorsFromRegistry } from "../lib/projectSectors";
import { useSectorsOptional } from "../context/SectorsContext";

export default function SectorDots({ project, size = "md", className = "", registry: registryProp }) {
  const sectorsCtx = useSectorsOptional();
  const registry = registryProp || sectorsCtx?.sectors;
  const sectors = registry
    ? getEnabledSectorsWithColorsFromRegistry(project, registry)
    : getEnabledSectorsWithColorsFromRegistry(project, []);

  if (!sectors.length) return null;

  const label = sectors.map((s) => s.label).join(", ");

  return (
    <span
      className={`sector-dots sector-dots--${size} ${className}`.trim()}
      role="img"
      aria-label={`Setores: ${label}`}
      title={label}
    >
      {sectors.map((s) => (
        <span
          key={s.id}
          className="sector-dot"
          style={{ backgroundColor: s.color }}
          title={s.label}
        />
      ))}
    </span>
  );
}
