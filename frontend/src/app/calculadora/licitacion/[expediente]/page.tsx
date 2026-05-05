import { redirect } from "next/navigation";

export default function RedirectToOferta({
  params,
}: {
  params: { expediente: string };
}) {
  redirect(`/ofertas/${params.expediente}?tab=economica`);
}
