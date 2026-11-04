using EggsApp.Api.Data;

namespace EggsApp.Api.Features.Customers;

public static class CustomerEndpoints
{
    public static RouteGroupBuilder MapCustomers(this RouteGroupBuilder api)
    {
        var customers = api.MapGroup("/customers");

        customers.MapGet("/", (AppDbContext db, string? search) => ListCustomers.HandleAsync(db, search))
            .WithName("ListCustomers");

        customers.MapGet(
                "/similar",
                (AppDbContext db, string? name, Guid? excludeId) =>
                    FindSimilarCustomers.HandleAsync(db, name, excludeId))
            .WithName("FindSimilarCustomers");

        customers.MapGet("/{id:guid}", async (AppDbContext db, Guid id) =>
                await GetCustomer.HandleAsync(db, id) is { } customer
                    ? Results.Ok(customer)
                    : Results.NotFound())
            .WithName("GetCustomer");

        customers.MapPost("/", async (AppDbContext db, CustomerCommand command) =>
            {
                var fields = CustomerValidator.Clean(command);
                var errors = CustomerValidator.Validate(fields);

                if (errors.Count > 0)
                {
                    return Results.ValidationProblem(errors);
                }

                var customer = await CreateCustomer.HandleAsync(db, fields);
                return Results.Created($"/api/customers/{customer.Id}", customer);
            })
            .WithName("CreateCustomer");

        customers.MapPut("/{id:guid}", async (AppDbContext db, Guid id, CustomerCommand command) =>
            {
                var fields = CustomerValidator.Clean(command);
                var errors = CustomerValidator.Validate(fields);

                if (errors.Count > 0)
                {
                    return Results.ValidationProblem(errors);
                }

                return await UpdateCustomer.HandleAsync(db, id, fields) is { } customer
                    ? Results.Ok(customer)
                    : Results.NotFound();
            })
            .WithName("UpdateCustomer");

        customers.MapDelete("/{id:guid}", async (AppDbContext db, Guid id) =>
            {
                var result = await DeleteCustomer.HandleAsync(db, id);

                return result.Outcome switch
                {
                    DeleteCustomerOutcome.Deleted => Results.NoContent(),
                    DeleteCustomerOutcome.Blocked => Results.Conflict(new CustomerRefusal(result.BlockedMessage!)),
                    _ => Results.NotFound(),
                };
            })
            .WithName("DeleteCustomer");

        return api;
    }
}
