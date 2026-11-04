using System.Net;
using System.Net.Http.Json;
using EggsApp.Api.Features.Customers;
using EggsApp.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace EggsApp.Tests.Features.Customers;

// A new factory per test, because each test needs to know exactly which customers exist.
public sealed class CustomerEndpointsTests : IDisposable
{
    private readonly EggsAppFactory _factory = new();
    private readonly HttpClient _client;

    public CustomerEndpointsTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private async Task<CustomerDetail> CreateAsync(string name, string? phone = null, string? notes = null)
    {
        var response = await _client.PostAsJsonAsync("/api/customers", new CustomerCommand(name, phone, notes));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CustomerDetail>())!;
    }

    private async Task<string[]> ListNamesAsync(string? search = null)
    {
        var url = search is null ? "/api/customers" : $"/api/customers?search={Uri.EscapeDataString(search)}";
        var list = await _client.GetFromJsonAsync<CustomerListResponse>(url);
        return [.. list!.Items.Select(customer => customer.Name)];
    }

    private async Task<string[]> SimilarNamesAsync(string name, Guid? excludeId = null)
    {
        var url = $"/api/customers/similar?name={Uri.EscapeDataString(name)}";
        var list = await _client.GetFromJsonAsync<CustomerListResponse>(excludeId is null ? url : $"{url}&excludeId={excludeId}");
        return [.. list!.Items.Select(customer => customer.Name)];
    }

    private static async Task<IDictionary<string, string[]>> ReadErrorsAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        return problem!.Errors;
    }

    [Fact]
    public async Task Create_StoresTheCustomerAndSaysWhere()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/customers",
            new CustomerCommand("María Rodríguez", "8888-8888 (hija)", "Casa verde"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<CustomerDetail>())!;
        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.Equal($"/api/customers/{created.Id}", response.Headers.Location!.ToString());

        var read = await _client.GetFromJsonAsync<CustomerDetail>(response.Headers.Location);
        Assert.Equal(new CustomerDetail(created.Id, "María Rodríguez", "8888-8888 (hija)", "Casa verde"), read);
    }

    [Fact]
    public async Task Create_CleansTheFields()
    {
        var created = await CreateAsync("  María \t  Rodríguez ", "   ", "\n ");

        Assert.Equal("María Rodríguez", created.Name);
        Assert.Null(created.Phone);
        Assert.Null(created.Notes);
    }

    [Fact]
    public async Task Create_NamesDontHaveToBeUnique()
    {
        var first = await CreateAsync("María");
        var second = await CreateAsync("María");

        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(["María", "María"], await ListNamesAsync());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_RefusesAMissingNameInSpanish(string? name)
    {
        var response = await _client.PostAsJsonAsync("/api/customers", new CustomerCommand(name, null, null));

        var errors = await ReadErrorsAsync(response);
        Assert.Equal(["Escriba el nombre del cliente."], errors["name"]);
        Assert.Empty(await ListNamesAsync());
    }

    [Fact]
    public async Task Create_AcceptsTheLongestAllowedValues()
    {
        var created = await CreateAsync(
            new string('a', Customer.NameMaxLength),
            new string('1', Customer.PhoneMaxLength),
            new string('n', Customer.NotesMaxLength));

        Assert.Equal(Customer.NameMaxLength, created.Name.Length);
    }

    [Fact]
    public async Task Create_RefusesTooLongValuesFieldByField()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/customers",
            new CustomerCommand(
                new string('a', Customer.NameMaxLength + 1),
                new string('1', Customer.PhoneMaxLength + 1),
                new string('n', Customer.NotesMaxLength + 1)));

        var errors = await ReadErrorsAsync(response);
        Assert.Contains("nombre", errors["name"][0]);
        Assert.Contains("teléfono", errors["phone"][0]);
        Assert.Contains("notas", errors["notes"][0]);
    }

    [Fact]
    public async Task Update_ChangesTheFieldsAndCanClearThem()
    {
        var created = await CreateAsync("María", "8888-8888", "Casa verde");

        var response = await _client.PutAsJsonAsync(
            $"/api/customers/{created.Id}",
            new CustomerCommand(" María Solís ", "", null));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var expected = new CustomerDetail(created.Id, "María Solís", null, null);
        Assert.Equal(expected, await response.Content.ReadFromJsonAsync<CustomerDetail>());
        Assert.Equal(expected, await _client.GetFromJsonAsync<CustomerDetail>($"/api/customers/{created.Id}"));
    }

    [Fact]
    public async Task Update_ValidatesLikeCreate()
    {
        var created = await CreateAsync("María");

        var response = await _client.PutAsJsonAsync(
            $"/api/customers/{created.Id}",
            new CustomerCommand(" ", null, null));

        Assert.Contains("name", (await ReadErrorsAsync(response)).Keys);
        Assert.Equal(["María"], await ListNamesAsync());
    }

    [Fact]
    public async Task UnknownCustomer_IsNotFound()
    {
        var id = Guid.NewGuid();
        var command = new CustomerCommand("María", null, null);

        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/customers/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.PutAsJsonAsync($"/api/customers/{id}", command)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync($"/api/customers/{id}")).StatusCode);
    }

    [Fact]
    public async Task Delete_HidesTheCustomerEverywhere()
    {
        var created = await CreateAsync("María");
        var url = $"/api/customers/{created.Id}";

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync(url)).StatusCode);

        Assert.Empty(await ListNamesAsync());
        Assert.Empty(await ListNamesAsync("María"));
        Assert.Empty(await SimilarNamesAsync("María"));
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync(url)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await _client.PutAsJsonAsync(url, new CustomerCommand("Otra", null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Delete_KeepsTheRowAndMarksIt()
    {
        var created = await CreateAsync("María");

        await _client.DeleteAsync($"/api/customers/{created.Id}");

        using var connection = _factory.ConnectToDatabase();
        Assert.Equal(1L, TestDatabaseFolder.Scalar(connection, "SELECT COUNT(*) FROM Customers WHERE IsDeleted = 1"));
        Assert.Equal("María", TestDatabaseFolder.Scalar(connection, "SELECT Name FROM Customers"));
    }

    [Fact]
    public async Task Delete_LeavesTheNameFreeToUseAgain()
    {
        var deleted = await CreateAsync("María");
        await _client.DeleteAsync($"/api/customers/{deleted.Id}");

        var created = await CreateAsync("María");

        Assert.NotEqual(deleted.Id, created.Id);
        Assert.Equal(["María"], await ListNamesAsync());
    }

    [Theory]
    [InlineData("maría")]
    [InlineData("MARÍA")]
    [InlineData("maria")]
    [InlineData("MARIA")]
    [InlineData("  mar  ")]
    [InlineData("rodriguez maria")]
    [InlineData("rodri")]
    public async Task Search_IgnoresAccentsCaseAndWordOrder(string search)
    {
        await CreateAsync("María Rodríguez");
        await CreateAsync("Pedro Solís");

        Assert.Equal(["María Rodríguez"], await ListNamesAsync(search));
    }

    [Fact]
    public async Task Search_FindsAnEnyeWrittenAsN()
    {
        await CreateAsync("Ana Peña");

        Assert.Equal(["Ana Peña"], await ListNamesAsync("pena"));
        Assert.Equal(["Ana Peña"], await ListNamesAsync("PEÑA"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Search_BlankListsEveryone(string search)
    {
        await CreateAsync("María");
        await CreateAsync("Pedro");

        Assert.Equal(2, (await ListNamesAsync(search)).Length);
    }

    [Fact]
    public async Task Search_NoMatchIsAnEmptyList()
    {
        await CreateAsync("María");

        Assert.Empty(await ListNamesAsync("zzz"));
    }

    [Fact]
    public async Task List_IsInSpanishAlphabeticalOrder()
    {
        foreach (var name in new[] { "Zoila", "Ñeco", "ángela", "Nora", "Óscar", "Beto", "Ana" })
        {
            await CreateAsync(name);
        }

        Assert.Equal(["Ana", "ángela", "Beto", "Nora", "Ñeco", "Óscar", "Zoila"], await ListNamesAsync());
    }

    [Fact]
    public async Task List_DoesNotSendTheNotes()
    {
        await CreateAsync("María", "8888-8888", "Casa verde");

        var body = await _client.GetStringAsync("/api/customers");

        Assert.Contains("\"items\":[{", body);
        Assert.Contains("8888-8888", body);
        Assert.DoesNotContain("Casa verde", body);
    }

    [Fact]
    public async Task Similar_LeavesOutTheCustomerBeingEdited()
    {
        var created = await CreateAsync("María Rodríguez");

        Assert.Equal(["María Rodríguez"], await SimilarNamesAsync("maria rodriguez"));
        Assert.Empty(await SimilarNamesAsync("maria rodriguez", created.Id));
    }

    [Fact]
    public async Task Similar_PutsTheSameNameFirstAndReturnsThreeAtMost()
    {
        foreach (var name in new[] { "María Alfaro", "María Brenes", "María Castro", "María Duarte", "María" })
        {
            await CreateAsync(name);
        }

        Assert.Equal(["María", "María Alfaro", "María Brenes"], await SimilarNamesAsync("maria"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Similar_BlankNameFindsNothing(string name)
    {
        await CreateAsync("María");

        Assert.Empty(await SimilarNamesAsync(name));
    }
}
