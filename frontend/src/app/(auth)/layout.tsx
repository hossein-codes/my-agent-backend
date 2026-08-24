import { Container } from "@/components/layout/container";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="flex min-h-dvh flex-col justify-center py-8">
      {children}
    </Container>
  );
}
