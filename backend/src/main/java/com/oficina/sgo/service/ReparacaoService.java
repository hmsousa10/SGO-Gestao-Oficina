package com.oficina.sgo.service;

import com.oficina.sgo.dao.AgendamentoDao;
import com.oficina.sgo.dao.ClienteDao;
import com.oficina.sgo.dao.OperacaoReparacaoDao;
import com.oficina.sgo.dao.ReparacaoDao;
import com.oficina.sgo.dao.UserDao;
import com.oficina.sgo.dao.ViaturaDao;
import com.oficina.sgo.dto.request.CreateOperacaoRequest;
import com.oficina.sgo.dto.request.CreateReparacaoRequest;
import com.oficina.sgo.dto.response.OperacaoResponse;
import com.oficina.sgo.dto.response.ReparacaoResponse;
import com.oficina.sgo.exception.BusinessException;
import com.oficina.sgo.exception.CapacidadeOficinaException;
import com.oficina.sgo.exception.ResourceNotFoundException;
import com.oficina.sgo.model.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;

import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

public class ReparacaoService {

    private static final int MAX_REPARACOES_ATIVAS = 8;

    private final EntityManagerFactory emf;
    private final ReparacaoDao reparacaoDao;
    private final OperacaoReparacaoDao operacaoDao;
    private final ClienteDao clienteDao;
    private final ViaturaDao viaturaDao;
    private final UserDao userDao;
    private final AgendamentoDao agendamentoDao;

    public ReparacaoService(EntityManagerFactory emf) {
        this.emf = emf;
        this.reparacaoDao = new ReparacaoDao();
        this.operacaoDao = new OperacaoReparacaoDao();
        this.clienteDao = new ClienteDao();
        this.viaturaDao = new ViaturaDao();
        this.userDao = new UserDao();
        this.agendamentoDao = new AgendamentoDao();
    }

    public List<ReparacaoResponse> findAll() {
        try (EntityManager em = emf.createEntityManager()) {
            return reparacaoDao.findAll(em).stream().map(this::toResponse).collect(Collectors.toList());
        }
    }

    public ReparacaoResponse findById(Long id) {
        try (EntityManager em = emf.createEntityManager()) {
            return toResponse(reparacaoDao.findById(em, id)
                    .orElseThrow(() -> new ResourceNotFoundException("Reparacao", id)));
        }
    }

    public List<ReparacaoResponse> findByMecanico(Long mecanicoId) {
        try (EntityManager em = emf.createEntityManager()) {
            return reparacaoDao.findByMecanicoId(em, mecanicoId).stream()
                    .map(this::toResponse).collect(Collectors.toList());
        }
    }

    public ReparacaoResponse create(CreateReparacaoRequest request) {
        return inTransaction(em -> {
            Cliente cliente = clienteDao.findById(em, request.clienteId())
                    .orElseThrow(() -> new ResourceNotFoundException("Cliente", request.clienteId()));
            Viatura viatura = viaturaDao.findById(em, request.viaturaId())
                    .orElseThrow(() -> new ResourceNotFoundException("Viatura", request.viaturaId()));
            User mecanico = null;
            if (request.mecanicoId() != null) {
                mecanico = userDao.findById(em, request.mecanicoId())
                        .orElseThrow(() -> new ResourceNotFoundException("User", request.mecanicoId()));
            }
            Agendamento agendamento = null;
            if (request.agendamentoId() != null) {
                agendamento = agendamentoDao.findById(em, request.agendamentoId())
                        .orElseThrow(() -> new ResourceNotFoundException("Agendamento", request.agendamentoId()));
            }
            Reparacao reparacao = Reparacao.builder()
                    .agendamento(agendamento)
                    .viatura(viatura)
                    .cliente(cliente)
                    .mecanico(mecanico)
                    .descricao(request.descricao())
                    .estado(Reparacao.EstadoReparacao.PENDENTE)
                    .build();
            ReparacaoResponse resp = toResponse(reparacaoDao.save(em, reparacao));
            LogService.success("REPARACOES",
                "Nova reparação criada: viatura " + viatura.getMatricula() + 
                " | cliente " + cliente.getNome(), null);
            return resp;
        });
    }

    public ReparacaoResponse updateEstado(Long id, String estado) {
        return inTransaction(em -> {
            Reparacao reparacao = reparacaoDao.findById(em, id)
                    .orElseThrow(() -> new ResourceNotFoundException("Reparacao", id));
            Reparacao.EstadoReparacao novoEstado;
            try {
                String estadoNormalizado = estado != null ? estado.toUpperCase() : "";
                if ("EM_PROGRESSO".equals(estadoNormalizado)) {
                    estadoNormalizado = "EM_EXECUCAO";
                }
                novoEstado = Reparacao.EstadoReparacao.valueOf(estadoNormalizado);
            } catch (IllegalArgumentException e) {
                throw new BusinessException("Invalid estado: " + estado);
            }
            if (novoEstado == Reparacao.EstadoReparacao.EM_EXECUCAO) {
                long ativas = reparacaoDao.countAtivas(em);
                if (ativas >= MAX_REPARACOES_ATIVAS) {
                    throw new CapacidadeOficinaException(
                            "Oficina at maximum capacity (" + MAX_REPARACOES_ATIVAS + " active reparacoes)");
                }
                reparacao.setDataInicio(LocalDateTime.now());
            } else if (novoEstado == Reparacao.EstadoReparacao.CONCLUIDA) {
                reparacao.setDataFim(LocalDateTime.now());
            }
            reparacao.setEstado(novoEstado);
            ReparacaoResponse resp = toResponse(reparacaoDao.save(em, reparacao));
            LogService.info("REPARACOES",
                "Reparação #" + id + " alterada para estado: " + novoEstado.name(), null);
            if (novoEstado == Reparacao.EstadoReparacao.CONCLUIDA) {
                LogService.success("REPARACOES",
                    "Reparação #" + id + " concluída com sucesso", null);
            }
            return resp;
        });
    }

    public OperacaoResponse addOperacao(Long reparacaoId, CreateOperacaoRequest request) {
        return inTransaction(em -> {
            Reparacao reparacao = reparacaoDao.findById(em, reparacaoId)
                    .orElseThrow(() -> new ResourceNotFoundException("Reparacao", reparacaoId));
            OperacaoReparacao operacao = OperacaoReparacao.builder()
                    .reparacao(reparacao)
                    .descricao(request.descricao())
                    .tempoEstimadoMinutos(request.tempoEstimadoMinutos())
                    .observacoes(request.observacoes())
                    .estado(OperacaoReparacao.EstadoOperacao.PENDENTE)
                    .build();
            return toOperacaoResponse(operacaoDao.save(em, operacao));
        });
    }

    public OperacaoResponse updateOperacao(Long reparacaoId, Long opId, CreateOperacaoRequest request) {
        return inTransaction(em -> {
            reparacaoDao.findById(em, reparacaoId)
                    .orElseThrow(() -> new ResourceNotFoundException("Reparacao", reparacaoId));
            OperacaoReparacao operacao = operacaoDao.findById(em, opId)
                    .orElseThrow(() -> new ResourceNotFoundException("Operacao", opId));
            
            if (request.descricao() != null) {
                operacao.setDescricao(request.descricao());
            }
            if (request.tempoEstimadoMinutos() != null) {
                operacao.setTempoEstimadoMinutos(request.tempoEstimadoMinutos());
            }
            if (request.observacoes() != null) {
                operacao.setObservacoes(request.observacoes());
            }
            
            // Adicionar tempo real sem perder o tempo que já lá estava!
            if (request.tempoRealMinutos() != null) {
                int tempoExistente = operacao.getTempoRealMinutos() != null ? operacao.getTempoRealMinutos() : 0;
                operacao.setTempoRealMinutos(tempoExistente + request.tempoRealMinutos());
            }

            // Atualizar o estado da operação (PENDENTE, EM_EXECUCAO, CONCLUIDA)
            if (request.estado() != null) {
                try {
                    operacao.setEstado(OperacaoReparacao.EstadoOperacao.valueOf(request.estado().toUpperCase()));
                } catch (IllegalArgumentException e) {
                    // Ignora em caso de erro no estado
                }
            }
            
            return toOperacaoResponse(operacaoDao.save(em, operacao));
        });
    }

    // 1. Método ADICIONADO: Para Atualizar (Editar) a Reparação inteira
    public ReparacaoResponse update(Long id, CreateReparacaoRequest request) {
        return inTransaction(em -> {
            Reparacao reparacao = reparacaoDao.findById(em, id)
                    .orElseThrow(() -> new ResourceNotFoundException("Reparação", id));

            if (request.viaturaId() != null) {
                Viatura viatura = viaturaDao.findById(em, request.viaturaId())
                        .orElseThrow(() -> new ResourceNotFoundException("Viatura", request.viaturaId()));
                reparacao.setViatura(viatura);
            }
            
            if (request.clienteId() != null) {
                Cliente cliente = clienteDao.findById(em, request.clienteId())
                        .orElseThrow(() -> new ResourceNotFoundException("Cliente", request.clienteId()));
                reparacao.setCliente(cliente);
            }

            if (request.mecanicoId() != null) {
                User mecanico = userDao.findById(em, request.mecanicoId())
                        .orElseThrow(() -> new ResourceNotFoundException("Mecânico", request.mecanicoId()));
                reparacao.setMecanico(mecanico);
            } else {
                reparacao.setMecanico(null); // Permite remover o mecânico atribuído
            }

            if (request.descricao() != null) {
                reparacao.setDescricao(request.descricao());
            }
            
            // ADICIONADO: Guardar o valor total faturado na Base de Dados
            if (request.valorTotal() != null) {
                reparacao.setValorTotal(request.valorTotal());
            }

            return toResponse(reparacaoDao.save(em, reparacao));
        });
    }

    // 2. Método ADICIONADO: Para Eliminar a Reparação
    public Void delete(Long id) {
        return inTransaction(em -> {
            Reparacao reparacao = reparacaoDao.findById(em, id)
                    .orElseThrow(() -> new ResourceNotFoundException("Reparação", id));
            
            // Remove a reparação da base de dados
            em.remove(reparacao);
            return null;
        });
    }

    private ReparacaoResponse toResponse(Reparacao r) {
        List<OperacaoResponse> operacoes = r.getOperacoes() != null
                ? r.getOperacoes().stream().map(this::toOperacaoResponse).collect(Collectors.toList())
                : List.of();

        Viatura viatura = r.getViatura();
        Cliente cliente = r.getCliente();
        User mecanico = r.getMecanico();
        Agendamento agendamento = r.getAgendamento();
                
        // EXTRAIR PEÇAS DA BD PARA ENVIAR PARA A FATURAÇÃO
        List<ReparacaoResponse.PecaUtilizada> pecasUsadas = r.getMovimentosStock() != null
                ? r.getMovimentosStock().stream()
            .filter(m -> m != null && m.getPeca() != null)
            .map(m -> new ReparacaoResponse.PecaUtilizada(
                m.getPeca().getDesignacao(),
                m.getQuantidade() != null ? Math.abs(m.getQuantidade()) : 0,
                m.getPeca().getPrecoUnitario()
            )).collect(Collectors.toList())
                : List.of();

        return new ReparacaoResponse(
                r.getId(),
            agendamento != null ? agendamento.getId() : null,
            viatura != null ? viatura.getId() : null,
            viatura != null ? viatura.getMatricula() : null,
            viatura != null ? viatura.getMarca() : null,
            viatura != null ? viatura.getModelo() : null,
            cliente != null ? cliente.getId() : null,
            cliente != null ? cliente.getNome() : null,
            mecanico != null ? mecanico.getId() : null,
            mecanico != null ? mecanico.getName() : null,
                r.getDataInicio(), r.getDataFim(), normalizeEstado(r.getEstado()),
                r.getDescricao(), r.getTempoTotalMinutos(), r.getValorTotal(), 
                operacoes,
                pecasUsadas // <--- PEÇAS ADICIONADAS AQUI PARA O FRONTEND AS APANHAR!
        );
    }

    private String normalizeEstado(Reparacao.EstadoReparacao estado) {
        if (estado == null) return null;
        return estado == Reparacao.EstadoReparacao.EM_PROGRESSO ? "EM_EXECUCAO" : estado.name();
    }

    private OperacaoResponse toOperacaoResponse(OperacaoReparacao o) {
        return new OperacaoResponse(o.getId(), o.getReparacao() != null ? o.getReparacao().getId() : null, o.getDescricao(),
            o.getTempoEstimadoMinutos(), o.getTempoRealMinutos(), o.getEstado() != null ? o.getEstado().name() : null,
                o.getDataInicio(), o.getDataFim(), o.getObservacoes());
    }

    private <T> T inTransaction(Function<EntityManager, T> action) {
        EntityManager em = emf.createEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            T result = action.apply(em);
            tx.commit();
            return result;
        } catch (RuntimeException e) {
            if (tx.isActive()) tx.rollback();
            throw e;
        } finally {
            em.close();
        }
    }
}