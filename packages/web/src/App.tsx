import React, { useState, useCallback } from "react";
import {
  AppLayout,
  BreadcrumbGroup,
  SideNavigation,
  TopNavigation,
} from "@cloudscape-design/components";
import { HomePage } from "./pages/HomePage";
import { UploadPage } from "./pages/UploadPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { RunningPage } from "./pages/RunningPage";
import { ResultsPage } from "./pages/ResultsPage";

type Page = "home" | "upload" | "analysis" | "running" | "results";

function parseRoute(): { page: Page; sessionId: string | null } {
  const hash = window.location.hash.slice(1) || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "session" && parts[1]) {
    const page = (parts[2] as Page) || "analysis";
    return { page, sessionId: parts[1] };
  }
  if (parts[0] === "upload") return { page: "upload", sessionId: parts[1] || null };
  return { page: "home", sessionId: null };
}

export function App() {
  const [route, setRoute] = useState(parseRoute);

  const navigate = useCallback((page: Page, sessionId?: string) => {
    const sid = sessionId ?? route.sessionId;
    if (page === "home") {
      window.location.hash = "/";
    } else if (page === "upload") {
      window.location.hash = `/upload/${sid || ""}`;
    } else {
      window.location.hash = `/session/${sid}/${page}`;
    }
    setRoute({ page, sessionId: sid });
  }, [route.sessionId]);

  window.onhashchange = () => setRoute(parseRoute());

  const breadcrumbs = [
    { text: "AutoForecast", href: "#/" },
    ...(route.page !== "home" ? [{ text: route.page.charAt(0).toUpperCase() + route.page.slice(1), href: "#" }] : []),
  ];

  return (
    <>
      <TopNavigation
        identity={{ title: "AutoForecast", href: "#/" }}
        i18nStrings={{ overflowMenuTriggerText: "More", searchIconAriaLabel: "Search", searchDismissIconAriaLabel: "Close" }}
      />
      <AppLayout
        navigation={
          <SideNavigation
            header={{ text: "AutoForecast", href: "#/" }}
            activeHref={`#${window.location.hash.slice(1) || "/"}`}
            items={[
              { type: "link", text: "Home", href: "#/" },
              { type: "divider" },
              { type: "link", text: "New Forecast", href: "#/upload/" },
            ]}
          />
        }
        breadcrumbs={<BreadcrumbGroup items={breadcrumbs} />}
        toolsHide
        content={
          <>
            {route.page === "home" && <HomePage onNavigate={navigate} />}
            {route.page === "upload" && <UploadPage sessionId={route.sessionId} onNavigate={navigate} />}
            {route.page === "analysis" && <AnalysisPage sessionId={route.sessionId!} onNavigate={navigate} />}
            {route.page === "running" && <RunningPage sessionId={route.sessionId!} onNavigate={navigate} />}
            {route.page === "results" && <ResultsPage sessionId={route.sessionId!} onNavigate={navigate} />}
          </>
        }
      />
    </>
  );
}
