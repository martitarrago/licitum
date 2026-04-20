import { CertificadoRevision } from "@/components/solvencia/CertificadoRevision";

interface Props {
  params: { id: string };
}

export default function CertificadoRevisionPage({ params }: Props) {
  return <CertificadoRevision id={params.id} />;
}
