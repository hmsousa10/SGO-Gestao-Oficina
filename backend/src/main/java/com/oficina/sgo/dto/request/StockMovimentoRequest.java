package com.oficina.sgo.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public record StockMovimentoRequest(
    @NotNull(message = "Quantidade is required")
    @Positive(message = "Quantidade must be positive")
    Integer quantidade,
    
    BigDecimal precoCusto, // Adicionado para suportar o que o frontend envia
    
    String observacoes
) {}