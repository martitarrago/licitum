import { Calculator } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function BC3Page() {
  return (
    <ModulePlaceholder
      titulo="Estudio Económico BC3"
      descripcion="Convierte el presupuesto de la administración en BC3 y Excel. Detecta partidas deficitarias antes de firmar."
      icon={Calculator}
    />
  );
}
