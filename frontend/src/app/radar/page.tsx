import { Radar } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function RadarPage() {
  return (
    <ModulePlaceholder
      titulo="Radar IA"
      descripcion="Feed inteligente de licitaciones PLACSP filtradas por tu clasificación y solvencia. Solo oportunidades reales."
      icon={Radar}
    />
  );
}
