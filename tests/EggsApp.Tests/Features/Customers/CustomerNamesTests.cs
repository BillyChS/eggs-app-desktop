using EggsApp.Api.Features.Customers;

namespace EggsApp.Tests.Features.Customers;

public sealed class CustomerNamesTests
{
    [Theory]
    [InlineData("María Rodríguez", "maria rodriguez")] // Same name, without accents or case.
    [InlineData("María  Rodríguez", "MARÍA RODRÍGUEZ")]
    [InlineData("María", "María Rodríguez")] // All the words of one are in the other.
    [InlineData("Rodríguez María", "María Rodríguez")]
    [InlineData("Maria", "Mario")] // A one-letter typo in a short name.
    [InlineData("Ana", "Anna")]
    [InlineData("María Rodríguez", "Maria Rodrigez")] // Up to two in a longer one.
    [InlineData("Maria Rodriguez", "Marya Rodrigez")]
    [InlineData("Peña", "Pena")]
    public void AreSimilar_True(string first, string second)
    {
        Assert.True(CustomerNames.AreSimilar(first, second));
        Assert.True(CustomerNames.AreSimilar(second, first));
    }

    [Theory]
    [InlineData("Ana", "Ara")] // Too short to tell a typo from another name.
    [InlineData("Pedro", "María")]
    [InlineData("Juan", "Juana Mora")]
    [InlineData("Carla", "Marta")] // Two letters off is too many in a short name.
    [InlineData("María Rodríguez", "María Solís")] // Same first name only.
    [InlineData("", "María")]
    [InlineData("   ", "María")]
    public void AreSimilar_False(string first, string second)
    {
        Assert.False(CustomerNames.AreSimilar(first, second));
        Assert.False(CustomerNames.AreSimilar(second, first));
    }

    [Fact]
    public void Clean_UsesOneEncodingForAccents()
    {
        // "í" as an "i" plus a combining accent, as pasted text can have it.
        var decomposed = "María";

        Assert.Equal("María", CustomerNames.Clean(decomposed));
        Assert.True(CustomerNames.MatchesSearch(decomposed, "maría"));
    }
}
