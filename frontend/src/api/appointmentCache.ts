import type { QueryClient } from "@tanstack/react-query";
import type { Appointment, Paginated } from "../types/domain";

/**
 * Keep appointment detail and list views consistent after a mutation.
 * Prefix matching covers doctor and patient appointment lists without
 * coupling this helper to a particular portal profile identifier.
 */
export function syncAppointmentCache(
  queryClient: QueryClient,
  appointment: Appointment
) {
  queryClient.setQueryData<Appointment>(
    ["appointment", appointment.name],
    appointment
  );
  queryClient.setQueriesData<Paginated<Appointment>>(
    { queryKey: ["appointments"] },
    (cached) => {
      if (!cached?.data.some((item) => item.name === appointment.name)) {
        return cached;
      }
      return {
        ...cached,
        data: cached.data.map((item) =>
          item.name === appointment.name ? appointment : item
        )
      };
    }
  );
  return queryClient.invalidateQueries({ queryKey: ["appointments"] });
}
