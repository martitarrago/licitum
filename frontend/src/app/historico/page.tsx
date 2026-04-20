import { TrendingUp } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function HistoricoPage() {
  return (
    <ModulePlaceholder
      titulo="Histórico de Resultados"
      descripcion="Analiza cada licitación en la que participaste. Aprende por qué ganaste o perdiste y mejora tu tasa de éxito."
      icon={TrendingUp}
    />
  );
}
