import { FileSignature } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function AdminPage() {
  return (
    <ModulePlaceholder
      titulo="Control Administrativo"
      descripcion="Generación automática de DEUC y gestión de avales bancarios. Controla fechas de devolución y libera liquidez."
      icon={FileSignature}
    />
  );
}
