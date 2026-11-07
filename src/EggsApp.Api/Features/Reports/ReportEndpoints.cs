using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Reports;

public static class ReportEndpoints
{
    public static RouteGroupBuilder MapReports(this RouteGroupBuilder api)
    {
        api.MapGet("/reports/summary", async (AppDbContext db, string? from, string? to) =>
            {
                var errors = CalendarDays.ReadRange(from, to, out var first, out var last);

                if (errors.Count == 0 && last.DayNumber - first.DayNumber >= GetSummary.MaxDays)
                {
                    errors["to"] = ["El período no puede ser de más de un año."];
                }

                return errors.Count > 0
                    ? Results.ValidationProblem(errors)
                    : Results.Ok(await GetSummary.HandleAsync(db, first, last));
            })
            .WithName("GetSummary");

        return api;
    }
}
