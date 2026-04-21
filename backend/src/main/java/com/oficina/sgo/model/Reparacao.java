package com.oficina.sgo.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "reparacoes")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Reparacao {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agendamento_id")
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private Agendamento agendamento;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "viatura_id", nullable = false)
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private Viatura viatura;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private Cliente cliente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mecanico_id")
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private User mecanico;

    private LocalDateTime dataInicio;
    private LocalDateTime dataFim;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private EstadoReparacao estado = EstadoReparacao.PENDENTE;

    @Column(columnDefinition = "TEXT")
    private String descricao;

    private Integer tempoTotalMinutos;

    @Column(precision = 10, scale = 2)
    private BigDecimal valorTotal;

    @OneToMany(mappedBy = "reparacao", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private List<OperacaoReparacao> operacoes = new ArrayList<>();

    @OneToMany(mappedBy = "reparacao", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private List<MovimentoStock> movimentosStock = new ArrayList<>();

    public enum EstadoReparacao {
        PENDENTE, 
        EM_EXECUCAO, 
        // Legacy status kept for backwards compatibility with older rows in DB.
        EM_PROGRESSO,
        AGUARDA_PECAS, // <--- ADICIONAR ESTA LINHA
        CONCLUIDA, 
        CANCELADA
    }
}
