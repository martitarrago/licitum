import { LayoutDashboard } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function DashboardPage() {
  return (
    <ModulePlaceholder
      titulo="Dashboard"
      descripcion="Vista general del estado de tu empresa: solvencia disponible, licitaciones en curso, avales y tasa de éxito."
      icon={LayoutDashboard}
    />
  );
}
