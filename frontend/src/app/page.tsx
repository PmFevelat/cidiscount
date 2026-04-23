import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { StoreView } from "@/components/StoreView";

export default function Home() {
  return (
    <BeforeAfterSlider
      before={<StoreView mode="original" />}
      after={<StoreView mode="redesign" />}
    />
  );
}
