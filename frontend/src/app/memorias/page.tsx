import { FileText } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function MemoriasPage() {
  return (
    <ModulePlaceholder
      titulo="Redactor de Memorias"
      descripcion="Genera memorias técnicas (Sobre B) adaptadas al pliego de cada licitación. Sin plantillas genéricas."
      icon={FileText}
    />
  );
}
