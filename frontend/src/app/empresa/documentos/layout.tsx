export default function DocumentosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          documentación
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Hacienda, Seguridad Social, pólizas, ISOs, REA y TC2 con sus fechas de
          caducidad. Cuando ganes una adjudicación provisional tendrás 10 días
          hábiles para presentarlos — tenerlos al día evita perder obras ya
          ganadas.
        </p>
      </header>
      {children}
    </div>
  );
}
