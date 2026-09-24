import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <p style={{ padding: 32 }}>
      Nothing here. <Link to="/">Go to your sessions</Link>
    </p>
  );
}
