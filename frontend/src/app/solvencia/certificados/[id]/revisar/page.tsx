import { CertificadoRevision } from "@/components/solvencia/CertificadoRevision";

interface Props {
  params: { id: string };
}

export default function CertificadoRevisarPage({ params }: Props) {
  return <CertificadoRevision id={params.id} />;
}
