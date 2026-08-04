export const dynamic = "force-dynamic";
import catalog from "../../../data/catalog.json";
import MainPage from "./MainPage";

export default function Page() {
  return <MainPage catalog={catalog} />;
}
