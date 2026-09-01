// ============================================================
// ELECTIONCANON — APPLICATION SHELL
//
// EXTRACTED FROM fatt-app's shared src/App.jsx (Alpha 1.7 standalone
// extraction). The original file was a multi-product router (Forge-A-
// Truck manufacturing rooms, Business, and ElectionCanon all mounted
// under one <Routes>, with a chrome-suppression check — `isElectionForge`
// — so ElectionCanon's own header/nav could replace the shared
// manufacturing kernel shell on its own paths). None of that
// multi-product logic belongs in a standalone ElectionCanon repository:
// there is only one product here, so it is always at the root, with no
// shared chrome to suppress in the first place.
//
// Preserved unchanged from the original: the ElectionCanon route itself
// (`<Election />` at `/election`), the `/access` sign-in route, and the
// `ForgeIdentityProvider` wrapping every route needs for authentication.
// ============================================================

import { Routes, Route } from "react-router-dom";
import { ForgeIdentityProvider } from "./os/ForgeIdentity.jsx";
import Landing from "./pages/Landing.jsx";
import Election from "./pages/Election.jsx";
import Access from "./pages/Access.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

export default function App() {
  return (
    <ForgeIdentityProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/election" element={<Election />} />
        <Route path="/access" element={<Access />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </ForgeIdentityProvider>
  );
}
