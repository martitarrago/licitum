import { Target } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function CompetenciaPage() {
  return (
    <ModulePlaceholder
      titulo="Vigilante de Competencia"
      descripcion="Histórico de bajas y simulador de puntos. Decide tu oferta económica basándote en datos reales del sector."
      icon={Target}
    />
  );
}
