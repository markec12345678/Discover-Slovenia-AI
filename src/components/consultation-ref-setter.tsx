"use client";

import { useEffect } from "react";
import { setConsultationRef } from "@/lib/consultation-ref";

// ============================================================================
// CONSULTATION REF SETTER — atribucija na zasebni strani konzultacije
// ============================================================================
// Obisk /konzultacija/{token} označi sejo (sessionStorage): rezervacija
// izkušnje, ki ji sledi, se atribuira konzultaciji (Booking.source =
// "consultation") → ponudnik vidi, da AI konzultacija prinaša rezervacije.
// Renders nothing — stranski učinek ob mountu.

export function ConsultationRefSetter() {
  useEffect(() => {
    setConsultationRef();
  }, []);
  return null;
}

export default ConsultationRefSetter;
